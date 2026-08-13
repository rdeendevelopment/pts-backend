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
const v2Database = require('../../../database/connection');
const {
  buildTimerContextFields,
  isDuplicateKeyError,
} = require('../helpers/timerContext.helper');

function getMaxTimerMinutes() {
  return Math.min(480, Number(env.v2.maxTimerMinutes || MAX_TIMER_MINUTES));
}

function getTimerReviewSeconds() {
  return Math.max(60, Number(env.v2.timerReviewMinutes || 240) * 60);
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

function activeTimerConflict(timer, message = 'A timer is already running') {
  return new AppError(message, {
    status: 409,
    code: activityErrorCodes.ACTIVE_TIMER_EXISTS,
    details: { canonicalTimer: toActiveTimerDto(timer) },
  });
}

function staleTimerConflict(timer) {
  return new AppError('Timer state changed on another client', {
    status: 409,
    code: activityErrorCodes.STALE_TIMER_VERSION,
    details: { canonicalTimer: toActiveTimerDto(timer) },
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
    let pauseAt = null;
    let reason = null;
    if (elapsedSeconds >= getTimerLimitSeconds(timer)) {
      const segmentAllowance = Math.max(0, getTimerLimitSeconds(timer) - Number(timer.accumulatedSeconds || 0));
      pauseAt = new Date(new Date(timer.startedAt).getTime() + segmentAllowance * 1000);
      reason = timer.limitReason || 'maximum_duration';
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
  const idempotencyKey = String(payload.idempotencyKey || '').trim() || null;
  if (idempotencyKey) {
    const prior = await activeTimerRepository.findByStartIdempotencyKey(userId, idempotencyKey);
    if (prior) return toActiveTimerDto(prior);
  }
  const context = buildTimerContextFields({
    clientId: payload.clientId,
    projectId: payload.projectId,
    workCategoryId: payload.workCategoryId,
    taskId: payload.taskId,
  });

  const actionable = await activeTimerRepository.findActionableByUserId(userId);
  if (actionable) {
    const needsCorrection = actionable.status === 'needs_correction';
    if (needsCorrection) {
      throw new AppError('Correct the frozen timer before starting another timer', {
        status: 409,
        code: activityErrorCodes.ACTIVITY_TIMER_MAX_DURATION_EXCEEDED,
        details: { canonicalTimer: toActiveTimerDto(actionable) },
      });
    }
    throw activeTimerConflict(actionable);
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

  const validation = await timeValidationService.validateTimeEntry({
    projectId: payload.projectId,
    userId,
    assignmentId: payload.assignmentId,
    budgetId: payload.budgetId,
    workCategoryId: payload.workCategoryId,
    entryDate: new Date(),
    timeWeek: week,
    minutes: 1,
    source: 'timer',
    throwOnError: true,
    req,
  });

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
      reviewThresholdSeconds: getTimerReviewSeconds(),
      limitReason: timerLimit.limitReason,
      lastHeartbeatAt: now,
      autoPauseReason: null,
      pausedAt: null,
      description: payload.description || null,
      startIdempotencyKey: idempotencyKey,
      revision: 0,
      status: 'running',
      createdBy: accountId,
      updatedBy: accountId,
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    if (idempotencyKey) {
      const prior = await activeTimerRepository.findByStartIdempotencyKey(userId, idempotencyKey);
      if (prior) return toActiveTimerDto(prior);
    }
    const canonical = await activeTimerRepository.findRunningByUserId(userId);
    if (canonical) throw activeTimerConflict(canonical);
    mapDuplicateKeyToConflict(err);
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
  const validation = await timeValidationService.validateTimeEntry({
    projectId: timer.projectId,
    userId,
    assignmentId: timer.assignmentId,
    budgetId: timer.budgetId,
    workCategoryId: timer.workCategoryId,
    entryDate: new Date(),
    timeWeek: week,
    minutes: 1,
    source: 'timer',
    throwOnError: true,
    req,
  });
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
        reviewThresholdSeconds: timer.reviewThresholdSeconds || getTimerReviewSeconds(),
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
  let timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);

  if (timer.status === 'stopped' || timer.status === 'cancelled') {
    return finalizeStoppedTimer(timer, accountId);
  }
  if (timer.status === 'needs_correction') {
    return { needsCorrection: true, timer: toActiveTimerDto(timer), maxMinutes: getMaxTimerMinutes() };
  }
  if (timer.status !== 'running' && timer.status !== 'paused') {
    throw new AppError('Timer is not active', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_NOT_RUNNING,
    });
  }

  const expectedVersion = req.body?.expectedVersion;
  if (expectedVersion !== undefined && Number(expectedVersion) !== Number(timer.revision || 0)) {
    throw staleTimerConflict(timer);
  }

  const stoppedAt = new Date();
  const elapsedSeconds = Math.min(getElapsedSeconds(timer, stoppedAt), getTimerLimitSeconds(timer));
  const elapsedMinutes = Math.ceil(elapsedSeconds / 60);
  const description = req.body?.description ?? timer.description;
  const nextStatus = elapsedMinutes <= 0 ? 'cancelled' : 'stopped';
  const stopped = await activeTimerRepository.updateTimer(
    timer._id,
    {
      status: nextStatus,
      stoppedAt,
      accumulatedSeconds: Math.max(0, elapsedSeconds),
      description,
      stopIdempotencyKey: String(req.body?.idempotencyKey || '').trim() || timer.stopIdempotencyKey || null,
      updatedBy: accountId,
    },
    null,
    {
      expectedStatus: timer.status,
      expectedRevision: expectedVersion !== undefined ? expectedVersion : null,
    },
  );

  if (!stopped) {
    timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);
    if (timer.status === 'stopped' || timer.status === 'cancelled') {
      return finalizeStoppedTimer(timer, accountId);
    }
    throw staleTimerConflict(timer);
  }

  activitySocketEvents.emitActivityTimerStopped(req.v2Activity.userId, toActiveTimerDto(stopped));
  return finalizeStoppedTimer(stopped, accountId);
}

async function finalizeStoppedTimer(timer, accountId) {
  if (timer.status === 'cancelled' || Number(timer.accumulatedSeconds || 0) <= 0) {
    return { cancelled: true, id: String(timer._id), timer: toActiveTimerDto(timer) };
  }
  try {
    const entry = await timeEntryService.createFinalizedTimerEntry(timer, accountId);
    return { timer: toActiveTimerDto(timer), entry };
  } catch (err) {
    const warning = `Timer stopped safely but its entry requires review: ${err.message}`;
    const reviewed = await activeTimerRepository.updateTimer(timer._id, {
      finalizationNeedsReview: true,
      finalizationWarning: warning,
      updatedBy: accountId,
    }, null, { expectedStatus: 'stopped' });
    return { timer: toActiveTimerDto(reviewed || timer), entry: null, needsReview: true, warning };
  }
}

async function heartbeatTimer(timerId, accountId, req) {
  const timer = await assertTimerOwner(await activeTimerRepository.findById(timerId), req);
  if (timer.status !== 'running') return toActiveTimerDto(timer);

  const now = new Date();
  const updated = await activeTimerRepository.updateTimer(timer._id, {
    lastHeartbeatAt: now,
    updatedBy: accountId,
  }, null, { expectedStatus: 'running', incrementRevision: false });
  return toActiveTimerDto(updated || timer);
}

async function switchTimer(payload, accountId, req) {
  const userId = req.v2Activity.userId;
  const current = await assertTimerOwner(
    await activeTimerRepository.findById(payload.currentTimerId),
    req,
  );
  if (current.status !== 'running' && current.status !== 'paused') {
    if (current.status === 'stopped') {
      const canonical = await activeTimerRepository.findRunningByUserId(userId);
      if (canonical) return { stoppedTimer: toActiveTimerDto(current), timer: toActiveTimerDto(canonical) };
    }
    throw new AppError('Current timer is no longer active', {
      status: 409,
      code: activityErrorCodes.STALE_TIMER_VERSION,
      details: { canonicalTimer: toActiveTimerDto(current) },
    });
  }
  if (
    payload.expectedVersion !== undefined
    && Number(payload.expectedVersion) !== Number(current.revision || 0)
  ) {
    throw staleTimerConflict(current);
  }

  const context = buildTimerContextFields(payload);
  const week = await timeWeekService.getOrCreateWeek(userId, new Date(), accountId);
  const validation = await timeValidationService.validateTimeEntry({
    projectId: payload.projectId,
    userId,
    assignmentId: payload.assignmentId,
    budgetId: payload.budgetId,
    workCategoryId: payload.workCategoryId,
    entryDate: new Date(),
    timeWeek: week,
    minutes: 1,
    source: 'timer',
    throwOnError: true,
    req,
  });
  const assignment = await require('../../projects').getAssignmentForUser(payload.projectId, userId);
  const at = new Date();
  const elapsedSeconds = Math.min(getElapsedSeconds(current, at), getTimerLimitSeconds(current));
  const timerLimit = resolveTimerLimit(validation);
  const idempotencyKey = String(payload.idempotencyKey || '').trim() || null;
  let stopped;
  let started;
  const session = await v2Database.getV2Connection().startSession();
  try {
    await session.withTransaction(async () => {
      stopped = await activeTimerRepository.updateTimer(current._id, {
        status: elapsedSeconds > 0 ? 'stopped' : 'cancelled',
        stoppedAt: at,
        accumulatedSeconds: Math.max(0, elapsedSeconds),
        description: payload.previousDescription ?? current.description,
        updatedBy: accountId,
      }, session, {
        expectedStatus: current.status,
        expectedRevision: payload.expectedVersion !== undefined ? payload.expectedVersion : null,
      });
      if (!stopped) throw staleTimerConflict(current);

      started = await activeTimerRepository.createTimer({
        clientId: context.clientId,
        projectId: context.projectId,
        assignmentId: assignment._id,
        userId,
        budgetId: payload.budgetId || validation?.budget?._id || null,
        taskId: context.taskId,
        taskKey: context.taskKey,
        workCategoryId: context.workCategoryId,
        startedAt: at,
        sessionStartedAt: at,
        accumulatedSeconds: 0,
        maxAccumulatedSeconds: timerLimit.maxAccumulatedSeconds,
        reviewThresholdSeconds: getTimerReviewSeconds(),
        limitReason: timerLimit.limitReason,
        lastHeartbeatAt: at,
        description: payload.description || null,
        startIdempotencyKey: idempotencyKey,
        revision: 0,
        status: 'running',
        createdBy: accountId,
        updatedBy: accountId,
      }, session);
    });
  } finally {
    await session.endSession();
  }

  const finalized = await finalizeStoppedTimer(stopped, accountId);
  const timerDto = toActiveTimerDto(started);
  activitySocketEvents.emitActivityTimerStopped(userId, toActiveTimerDto(stopped));
  activitySocketEvents.emitActivityTimerStarted(userId, timerDto);
  return { stoppedTimer: finalized.timer, entry: finalized.entry, timer: timerDto, switchedAt: at };
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
  switchTimer,
  resumeTimer,
  stopTimer,
  correctTimer,
  discardTimer,
  cancelTimer,
  getElapsedSeconds,
  freezeOverdueTimers,
};
