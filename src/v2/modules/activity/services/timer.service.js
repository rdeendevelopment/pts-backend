const env = require('../../../config/env');
const { AppError } = require('../../../kernel/errors');
const activityErrorCodes = require('../errors/activityErrorCodes');
const { MAX_TIMER_MINUTES } = require('../constants/activity.constants');
const activeTimerRepository = require('../repositories/activeTimer.repository');
const timeValidationService = require('./timeValidation.service');
const timeEntryService = require('./timeEntry.service');
const timeWeekService = require('./timeWeek.service');
const { toActiveTimerDto } = require('../dto/activity.dto');
const activitySocketEvents = require('../helpers/activitySocketEvents.helper');
const {
  buildTimerContextFields,
  isDuplicateKeyError,
} = require('../helpers/timerContext.helper');

function getMaxTimerMinutes() {
  return Math.min(480, Number(env.v2.maxTimerMinutes || MAX_TIMER_MINUTES));
}

function getAbandonedTimerMinutes() {
  return Math.max(1, Number(env.v2.abandonedTimerMinutes || 60));
}

function getTimerLimitSeconds(timer) {
  return Math.min(
    getMaxTimerMinutes() * 60,
    Math.max(1, Number(timer.maxAccumulatedSeconds || getMaxTimerMinutes() * 60)),
  );
}

function resolveTimerLimit(validation, accumulatedSeconds = 0) {
  const hardLimitSeconds = getMaxTimerMinutes() * 60;
  const allowExceed = Boolean(validation?.assignment?.allocation?.allowExceed);
  if (allowExceed) {
    return { maxAccumulatedSeconds: hardLimitSeconds, limitReason: 'maximum_duration' };
  }

  const remaining = [validation?.userRemainingMinutes, validation?.budgetRemainingMinutes]
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  const remainingSeconds = remaining.length
    ? Math.max(0, Math.min(...remaining) * 60)
    : hardLimitSeconds;
  const maxAccumulatedSeconds = Math.min(hardLimitSeconds, accumulatedSeconds + remainingSeconds);
  return {
    maxAccumulatedSeconds: Math.max(1, maxAccumulatedSeconds),
    limitReason: maxAccumulatedSeconds < hardLimitSeconds ? 'allocation_limit' : 'maximum_duration',
  };
}

function getElapsedSeconds(timer, at = new Date()) {
  const base = Number(timer.accumulatedSeconds || 0);
  if (timer.status === 'paused' || timer.status === 'needs_correction') {
    return base;
  }
  if (timer.status === 'running') {
    const segmentStart = new Date(timer.startedAt).getTime();
    if (!Number.isFinite(segmentStart)) return base;
    return base + Math.max(0, Math.floor((at.getTime() - segmentStart) / 1000));
  }
  return base;
}

function mapDuplicateKeyToConflict(err, context = {}) {
  if (!isDuplicateKeyError(err)) {
    throw err;
  }
  throw new AppError('A timer session already exists for this context', {
    status: 409,
    code: activityErrorCodes.ACTIVITY_TIMER_CONFLICT,
    details: context,
  });
}

async function assertTimerOwner(timer, req) {
  if (!timer) {
    throw new AppError('Timer not found', {
      status: 404,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_FOUND,
    });
  }

  if (String(timer.userId) !== String(req.v2Activity.userId)) {
    throw new AppError('Forbidden activity access', {
      status: 403,
      code: activityErrorCodes.ACTIVITY_FORBIDDEN,
    });
  }

  return timer;
}

async function getActiveTimerForUser(userId) {
  let timer = await activeTimerRepository.findActionableByUserId(userId);
  if (timer?.status === 'running') {
    const now = new Date();
    const elapsedSeconds = getElapsedSeconds(timer, now);
    if (elapsedSeconds >= getTimerLimitSeconds(timer)) {
      timer = await pauseRunningTimerAt(timer, now, null, timer.limitReason || 'maximum_duration');
    }
  }
  return toActiveTimerDto(timer);
}

async function pauseRunningTimerAt(timer, at, accountId = null, reason = 'automatic_pause') {
  if (timer.status !== 'running') return timer;
  const accumulatedSeconds = Math.min(getElapsedSeconds(timer, at), getTimerLimitSeconds(timer));
  const updated = await activeTimerRepository.updateTimer(timer._id, {
    status: 'paused',
    accumulatedSeconds,
    pausedAt: at,
    autoPauseReason: reason,
    ...(accountId ? { updatedBy: accountId } : {}),
  }, null, { expectedStatus: 'running' });
  return updated || activeTimerRepository.findById(timer._id);
}

async function freezeForCorrection(timer, frozenAt = new Date(), accountId = null) {
  if (timer.status === 'needs_correction') return timer;
  const accumulatedSeconds = getElapsedSeconds(timer, frozenAt);
  const updated = await activeTimerRepository.updateTimer(
    timer._id,
    {
      status: 'needs_correction',
      accumulatedSeconds,
      pausedAt: frozenAt,
      frozenAt,
      correctionReason: 'maximum_duration_exceeded',
      ...(accountId ? { updatedBy: accountId } : {}),
    },
    null,
    { expectedStatus: timer.status },
  );
  return updated || activeTimerRepository.findById(timer._id);
}

async function freezeOverdueTimers(at = new Date()) {
  const timers = await activeTimerRepository.listRunning();
  let frozen = 0;
  for (const timer of timers) {
    const elapsedSeconds = getElapsedSeconds(timer, at);
    const lastHeartbeatAt = timer.lastHeartbeatAt || timer.startedAt;
    const heartbeatAge = at.getTime() - new Date(lastHeartbeatAt).getTime();
    let pauseAt = null;
    let reason = null;
    if (elapsedSeconds >= getTimerLimitSeconds(timer)) {
      const segmentAllowance = Math.max(0, getTimerLimitSeconds(timer) - Number(timer.accumulatedSeconds || 0));
      pauseAt = new Date(new Date(timer.startedAt).getTime() + segmentAllowance * 1000);
      reason = timer.limitReason || 'maximum_duration';
    } else if (heartbeatAge >= getAbandonedTimerMinutes() * 60 * 1000) {
      pauseAt = new Date(lastHeartbeatAt);
      reason = 'heartbeat_timeout';
    }
    if (!pauseAt) continue;
    const updated = await pauseRunningTimerAt(timer, pauseAt, null, reason);
    if (updated?.status === 'paused') {
      frozen += 1;
      activitySocketEvents.emitActivityTimerStarted(timer.userId, toActiveTimerDto(updated));
    }
  }
  return { inspected: timers.length, frozen };
}

async function listPausedTimersForUser(userId) {
  const timers = await activeTimerRepository.listPausedByUserId(userId);
  return timers.map((timer) => toActiveTimerDto(timer));
}

async function startTimer(payload, accountId, req) {
  const userId = req.v2Activity.userId;
  const context = buildTimerContextFields({
    clientId: payload.clientId,
    projectId: payload.projectId,
    workCategoryId: payload.workCategoryId,
    taskId: payload.taskId,
  });

  const actionable = await activeTimerRepository.findActionableByUserId(userId);
  if (actionable) {
    const needsCorrection = actionable.status === 'needs_correction';
    throw new AppError(
      needsCorrection ? 'Correct the frozen timer before starting another timer' : 'A timer is already running',
      {
      status: 409,
      code: needsCorrection
        ? activityErrorCodes.ACTIVITY_TIMER_MAX_DURATION_EXCEEDED
        : activityErrorCodes.ACTIVITY_TIMER_ALREADY_RUNNING,
      details: {
        timerId: String(actionable._id),
        timerStatus: actionable.status,
        projectId: String(actionable.projectId),
        workCategoryId: String(actionable.workCategoryId),
        taskId: actionable.taskId ? String(actionable.taskId) : null,
      },
    });
  }

  const pausedSameContext = await activeTimerRepository.findPausedByContext(userId, context);
  if (pausedSameContext) {
    throw new AppError('A paused timer exists for this context. Use Resume.', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_PAUSED_EXISTS,
      details: {
        timerId: String(pausedSameContext._id),
        accumulatedSeconds: pausedSameContext.accumulatedSeconds,
        projectId: String(pausedSameContext.projectId),
        workCategoryId: String(pausedSameContext.workCategoryId),
        taskId: pausedSameContext.taskId ? String(pausedSameContext.taskId) : null,
      },
    });
  }

  const week = await timeWeekService.getOrCreateWeek(userId, new Date(), accountId);

  const validation = await timeValidationService.validateTimerStart({
    projectId: payload.projectId,
    userId,
    assignmentId: payload.assignmentId,
    budgetId: payload.budgetId,
    workCategoryId: payload.workCategoryId,
    entryDate: new Date(),
    timeWeek: week,
  }, req);

  const assignment = await require('../../projects').getAssignmentForUser(payload.projectId, userId);
  const resolvedBudgetId = payload.budgetId
    || validation?.budget?._id
    || null;

  const now = new Date();
  const timerLimit = resolveTimerLimit(validation);

  let timer;
  try {
    timer = await activeTimerRepository.createTimer({
      clientId: context.clientId,
      projectId: context.projectId,
      assignmentId: assignment._id,
      userId,
      budgetId: resolvedBudgetId,
      taskId: context.taskId,
      taskKey: context.taskKey,
      workCategoryId: context.workCategoryId,
      startedAt: now,
      sessionStartedAt: now,
      accumulatedSeconds: 0,
      maxAccumulatedSeconds: timerLimit.maxAccumulatedSeconds,
      limitReason: timerLimit.limitReason,
      lastHeartbeatAt: now,
      autoPauseReason: null,
      pausedAt: null,
      description: payload.description || null,
      status: 'running',
      createdBy: accountId,
      updatedBy: accountId,
    });
  } catch (err) {
    mapDuplicateKeyToConflict(err, {
      projectId: String(context.projectId),
      workCategoryId: String(context.workCategoryId),
      taskKey: context.taskKey,
    });
  }

  const timerDto = toActiveTimerDto(timer);
  activitySocketEvents.emitActivityTimerStarted(userId, timerDto);
  return timerDto;
}

async function pauseTimer(timerId, accountId, req) {
  const timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);

  if (timer.status !== 'running') {
    throw new AppError('Timer is not running', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_RUNNING,
    });
  }

  const now = new Date();
  const accumulatedSeconds = getElapsedSeconds(timer, now);
  if (accumulatedSeconds >= getTimerLimitSeconds(timer)) {
    const paused = await pauseRunningTimerAt(timer, now, accountId, timer.limitReason || 'maximum_duration');
    const timerDto = toActiveTimerDto(paused);
    activitySocketEvents.emitActivityTimerStarted(req.v2Activity.userId, timerDto);
    return timerDto;
  }

  let updated;
  try {
    updated = await activeTimerRepository.updateTimer(
      timer._id,
      {
        status: 'paused',
        accumulatedSeconds,
        pausedAt: now,
        updatedBy: accountId,
      },
      null,
      { expectedStatus: 'running' },
    );
  } catch (err) {
    mapDuplicateKeyToConflict(err, { timerId: String(timer._id) });
  }

  if (!updated) {
    const current = await activeTimerRepository.findById(timer._id);
    if (current?.status === 'paused') {
      return toActiveTimerDto(current);
    }
    throw new AppError('Timer state changed before it could be paused. Please try again.', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_RUNNING,
    });
  }

  const timerDto = toActiveTimerDto(updated);
  activitySocketEvents.emitActivityTimerStarted(req.v2Activity.userId, timerDto);
  return timerDto;
}

async function resumeTimer(timerId, accountId, req) {
  const userId = req.v2Activity.userId;
  const running = await activeTimerRepository.findRunningByUserId(userId);

  if (running && String(running._id) !== String(timerId)) {
    if (!req.body?.pauseRunningTimer) {
      throw new AppError('A timer is already running', {
        status: 409,
        code: activityErrorCodes.ACTIVITY_TIMER_ALREADY_RUNNING,
        details: {
          timerId: String(running._id),
          projectId: String(running.projectId),
          workCategoryId: String(running.workCategoryId),
          taskId: running.taskId ? String(running.taskId) : null,
        },
      });
    }
    await pauseTimer(running._id, accountId, req);
  }

  const timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);

  if (timer.status !== 'paused') {
    throw new AppError('Timer is not paused', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_PAUSED,
    });
  }

  if (Number(timer.accumulatedSeconds || 0) >= getMaxTimerMinutes() * 60) {
    throw new AppError('This timer reached the eight-hour single-run limit. Stop and save it before starting another.', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_MAX_DURATION_EXCEEDED,
    });
  }

  const week = await timeWeekService.getOrCreateWeek(userId, new Date(), accountId);
  const validation = await timeValidationService.validateTimerStart({
    projectId: timer.projectId,
    userId,
    assignmentId: timer.assignmentId,
    budgetId: timer.budgetId,
    workCategoryId: timer.workCategoryId,
    entryDate: new Date(),
    timeWeek: week,
  }, req);
  const timerLimit = resolveTimerLimit(validation, Number(timer.accumulatedSeconds || 0));

  const now = new Date();
  let updated;
  try {
    updated = await activeTimerRepository.updateTimer(
      timer._id,
      {
        status: 'running',
        startedAt: now,
        pausedAt: null,
        lastHeartbeatAt: now,
        maxAccumulatedSeconds: timerLimit.maxAccumulatedSeconds,
        limitReason: timerLimit.limitReason,
        autoPauseReason: null,
        updatedBy: accountId,
      },
      null,
      { expectedStatus: 'paused' },
    );
  } catch (err) {
    mapDuplicateKeyToConflict(err, { timerId: String(timer._id) });
  }

  const timerDto = toActiveTimerDto(updated);
  activitySocketEvents.emitActivityTimerStarted(userId, timerDto);
  return timerDto;
}

async function stopTimer(timerId, accountId, req) {
  const timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);

  if (timer.status !== 'running' && timer.status !== 'paused') {
    if (timer.status === 'needs_correction') {
      return {
        needsCorrection: true,
        timer: toActiveTimerDto(timer),
        maxMinutes: getMaxTimerMinutes(),
      };
    }
    throw new AppError('Timer is not active', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_RUNNING,
    });
  }

  if (timer.status === 'stopped') {
    throw new AppError('Timer already finalized', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_RUNNING,
    });
  }

  const stoppedAt = new Date();
  const elapsedSeconds = Math.min(getElapsedSeconds(timer, stoppedAt), getTimerLimitSeconds(timer));
  const elapsedMinutes = Math.ceil(elapsedSeconds / 60);
  const maxMinutes = getMaxTimerMinutes();

  if (elapsedMinutes > maxMinutes) {
    const frozen = await freezeForCorrection(timer, stoppedAt, accountId);
    const frozenDto = toActiveTimerDto(frozen);
    activitySocketEvents.emitActivityTimerStarted(req.v2Activity.userId, frozenDto);
    return {
      needsCorrection: true,
      timer: frozenDto,
      maxMinutes,
      elapsedMinutes,
    };
  }

  const expectedStatus = timer.status;

  if (elapsedMinutes <= 0) {
    await activeTimerRepository.updateTimer(timer._id, {
      status: 'cancelled',
      stoppedAt,
      updatedBy: accountId,
    }, null, { expectedStatus });
    return { cancelled: true, id: String(timer._id) };
  }

  const description = req.body?.description ?? timer.description;
  const sessionStart = timer.sessionStartedAt || timer.startedAt;

  const entry = await timeEntryService.createEntry({
    projectId: timer.projectId,
    assignmentId: timer.assignmentId,
    budgetId: timer.budgetId,
    taskId: timer.taskId,
    workCategoryId: timer.workCategoryId,
    entryDate: stoppedAt,
    startTime: sessionStart,
    endTime: stoppedAt,
    minutes: elapsedMinutes,
    description,
    source: 'timer',
  }, accountId, req);

  const stoppedTimerDoc = await activeTimerRepository.updateTimer(
    timer._id,
    { status: 'stopped', stoppedAt, description, updatedBy: accountId },
    null,
    { expectedStatus },
  );

  const stoppedTimer = toActiveTimerDto(stoppedTimerDoc);
  activitySocketEvents.emitActivityTimerStopped(req.v2Activity.userId, stoppedTimer);

  return { timer: stoppedTimer, entry };
}

async function heartbeatTimer(timerId, accountId, req) {
  const timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);
  if (timer.status !== 'running') return toActiveTimerDto(timer);

  const now = new Date();
  if (getElapsedSeconds(timer, now) >= getTimerLimitSeconds(timer)) {
    const paused = await pauseRunningTimerAt(timer, now, accountId, timer.limitReason || 'maximum_duration');
    activitySocketEvents.emitActivityTimerStarted(req.v2Activity.userId, toActiveTimerDto(paused));
    return toActiveTimerDto(paused);
  }
  const updated = await activeTimerRepository.updateTimer(timer._id, {
    lastHeartbeatAt: now,
    updatedBy: accountId,
  }, null, { expectedStatus: 'running' });
  return toActiveTimerDto(updated || timer);
}

async function correctTimer(timerId, payload, accountId, req) {
  const timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);
  if (timer.status !== 'needs_correction') {
    throw new AppError('Timer does not require correction', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_PAUSED,
      details: { status: timer.status },
    });
  }

  const sessionStart = new Date(timer.sessionStartedAt || timer.startedAt);
  const correctedEnd = new Date(payload.endTime);
  const frozenAt = new Date(timer.frozenAt || timer.pausedAt || new Date());
  if (
    !Number.isFinite(correctedEnd.getTime())
    || correctedEnd <= sessionStart
    || correctedEnd > frozenAt
  ) {
    throw new AppError('Corrected stop time must be after the timer start and no later than when it was frozen', {
      status: 400,
      code: activityErrorCodes.ACTIVITY_TIMER_MAX_DURATION_EXCEEDED,
      details: { sessionStart, frozenAt },
    });
  }

  const elapsedMinutes = Math.ceil((correctedEnd.getTime() - sessionStart.getTime()) / 60000);
  const maxMinutes = getMaxTimerMinutes();
  if (elapsedMinutes > maxMinutes) {
    throw new AppError('Corrected duration still exceeds the maximum timer duration', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_MAX_DURATION_EXCEEDED,
      details: { maxMinutes, elapsedMinutes },
    });
  }

  const description = payload.description ?? timer.description;
  const entry = await timeEntryService.createEntry({
    projectId: timer.projectId,
    assignmentId: timer.assignmentId,
    budgetId: timer.budgetId,
    taskId: timer.taskId,
    workCategoryId: timer.workCategoryId,
    entryDate: correctedEnd,
    startTime: sessionStart,
    endTime: correctedEnd,
    minutes: elapsedMinutes,
    description,
    source: 'timer',
  }, accountId, req);

  const stoppedTimerDoc = await activeTimerRepository.updateTimer(
    timer._id,
    {
      status: 'stopped',
      stoppedAt: correctedEnd,
      description,
      correctionReason: null,
      updatedBy: accountId,
    },
    null,
    { expectedStatus: 'needs_correction' },
  );
  const stoppedTimer = toActiveTimerDto(stoppedTimerDoc);
  activitySocketEvents.emitActivityTimerStopped(req.v2Activity.userId, stoppedTimer);
  return { timer: stoppedTimer, entry };
}

async function discardTimer(timerId, accountId, req) {
  const timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);

  if (timer.status !== 'paused') {
    throw new AppError('Timer is not paused', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_PAUSED,
    });
  }

  const updated = await activeTimerRepository.updateTimer(
    timer._id,
    { status: 'discarded', stoppedAt: new Date(), updatedBy: accountId },
    null,
    { expectedStatus: 'paused' },
  );

  return toActiveTimerDto(updated);
}

async function cancelTimer(timerId, accountId, req) {
  const timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);

  if (timer.status !== 'running' && timer.status !== 'paused') {
    throw new AppError('Timer is not active', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_RUNNING,
    });
  }

  const updated = await activeTimerRepository.updateTimer(
    timer._id,
    { status: 'cancelled', stoppedAt: new Date(), updatedBy: accountId },
    null,
    { expectedStatus: timer.status },
  );

  return toActiveTimerDto(updated);
}

module.exports = {
  getActiveTimerForUser,
  listPausedTimersForUser,
  startTimer,
  pauseTimer,
  heartbeatTimer,
  resumeTimer,
  stopTimer,
  correctTimer,
  discardTimer,
  cancelTimer,
  getElapsedSeconds,
  freezeOverdueTimers,
};
