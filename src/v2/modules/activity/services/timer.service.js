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
  return Number(env.v2.maxTimerMinutes || MAX_TIMER_MINUTES);
}

function getElapsedSeconds(timer, at = new Date()) {
  const base = Number(timer.accumulatedSeconds || 0);
  if (timer.status === 'paused') {
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
  const timer = await activeTimerRepository.findRunningByUserId(userId);
  return toActiveTimerDto(timer);
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

  const running = await activeTimerRepository.findRunningByUserId(userId);
  if (running) {
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

  const now = new Date();
  let updated;
  try {
    updated = await activeTimerRepository.updateTimer(
      timer._id,
      {
        status: 'running',
        startedAt: now,
        pausedAt: null,
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
  const elapsedSeconds = getElapsedSeconds(timer, stoppedAt);
  const elapsedMinutes = Math.ceil(elapsedSeconds / 60);
  const maxMinutes = getMaxTimerMinutes();

  if (elapsedMinutes > maxMinutes) {
    throw new AppError('Timer exceeded maximum duration', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_MAX_DURATION_EXCEEDED,
      details: { maxMinutes, elapsedMinutes },
    });
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
  resumeTimer,
  stopTimer,
  discardTimer,
  cancelTimer,
  getElapsedSeconds,
};
