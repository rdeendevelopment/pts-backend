const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const timerService = require('../services/timer.service');
const activeTimerRepository = require('../repositories/activeTimer.repository');
const timeEntryService = require('../services/timeEntry.service');
const activitySocketEvents = require('../helpers/activitySocketEvents.helper');

const TIMER_ID = '507f1f77bcf86cd799439010';
const USER_ID = '507f1f77bcf86cd799439012';
const ACCOUNT_ID = '507f1f77bcf86cd799439013';
const PROJECT_ID = '507f1f77bcf86cd799439014';
const STARTED_AT = new Date('2026-07-15T08:00:00.000Z');
const FROZEN_AT = new Date('2026-07-16T12:00:00.000Z');

const saved = {
  findById: activeTimerRepository.findById,
  updateTimer: activeTimerRepository.updateTimer,
  createEntry: timeEntryService.createEntry,
  emitStarted: activitySocketEvents.emitActivityTimerStarted,
  emitStopped: activitySocketEvents.emitActivityTimerStopped,
};

afterEach(() => {
  activeTimerRepository.findById = saved.findById;
  activeTimerRepository.updateTimer = saved.updateTimer;
  timeEntryService.createEntry = saved.createEntry;
  activitySocketEvents.emitActivityTimerStarted = saved.emitStarted;
  activitySocketEvents.emitActivityTimerStopped = saved.emitStopped;
});

function req() {
  return {
    body: {},
    v2Activity: { userId: USER_ID },
    v2Auth: { accountId: ACCOUNT_ID },
  };
}

function runningTimer() {
  return {
    _id: TIMER_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    assignmentId: '507f1f77bcf86cd799439015',
    workCategoryId: '507f1f77bcf86cd799439016',
    startedAt: STARTED_AT,
    sessionStartedAt: STARTED_AT,
    accumulatedSeconds: 0,
    status: 'running',
  };
}

test('over-limit stop caps the entry at eight hours without requiring correction', async () => {
  const timer = runningTimer();
  let entryPayload = null;
  activeTimerRepository.findById = async () => timer;
  activeTimerRepository.updateTimer = async (_id, payload) => ({ ...timer, ...payload });
  timeEntryService.createEntry = async (payload) => {
    entryPayload = payload;
    return { id: 'entry-1', minutes: payload.minutes };
  };
  activitySocketEvents.emitActivityTimerStopped = () => {};

  const result = await timerService.stopTimer(TIMER_ID, ACCOUNT_ID, req());

  assert.equal(result.timer.status, 'stopped');
  assert.equal(result.needsCorrection, undefined);
  assert.equal(entryPayload.minutes, 8 * 60);
});

test('correction saves valid duration and completes frozen timer', async () => {
  const timer = {
    ...runningTimer(),
    status: 'needs_correction',
    accumulatedSeconds: 28 * 60 * 60,
    frozenAt: FROZEN_AT,
    pausedAt: FROZEN_AT,
  };
  const correctedEnd = new Date('2026-07-15T15:30:00.000Z');
  let entryPayload = null;
  activeTimerRepository.findById = async () => timer;
  activeTimerRepository.updateTimer = async (_id, payload) => ({ ...timer, ...payload });
  timeEntryService.createEntry = async (payload) => {
    entryPayload = payload;
    return { id: 'entry-1', minutes: payload.minutes };
  };
  activitySocketEvents.emitActivityTimerStopped = () => {};

  const result = await timerService.correctTimer(
    TIMER_ID,
    { endTime: correctedEnd.toISOString(), description: 'Recovered timer' },
    ACCOUNT_ID,
    req(),
  );

  assert.equal(result.timer.status, 'stopped');
  assert.equal(entryPayload.minutes, 450);
  assert.equal(entryPayload.endTime.toISOString(), correctedEnd.toISOString());
});

test('invalid correction remains recoverable and does not create an entry', async () => {
  const timer = {
    ...runningTimer(),
    status: 'needs_correction',
    accumulatedSeconds: 28 * 60 * 60,
    frozenAt: FROZEN_AT,
  };
  activeTimerRepository.findById = async () => timer;
  timeEntryService.createEntry = async () => {
    assert.fail('entry must not be created');
  };

  await assert.rejects(
    () => timerService.correctTimer(
      TIMER_ID,
      { endTime: new Date('2026-07-16T10:00:00.000Z').toISOString() },
      ACCOUNT_ID,
      req(),
    ),
    (err) => err.code === 'ACTIVITY_TIMER_MAX_DURATION_EXCEEDED',
  );
});
