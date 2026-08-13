const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const timerService = require('../services/timer.service');
const activeTimers = require('../repositories/activeTimer.repository');
const timeEntries = require('../services/timeEntry.service');
const validation = require('../services/timeValidation.service');
const weeks = require('../services/timeWeek.service');
const sockets = require('../helpers/activitySocketEvents.helper');
const projects = require('../../projects');
const database = require('../../../database/connection');

const TIMER_ID = '507f1f77bcf86cd799439010';
const USER_ID = '507f1f77bcf86cd799439012';
const OTHER_USER_ID = '507f1f77bcf86cd799439099';
const ACCOUNT_ID = '507f1f77bcf86cd799439013';
const PROJECT_ID = '507f1f77bcf86cd799439014';
const CATEGORY_ID = '507f1f77bcf86cd799439016';

const originals = {};
for (const [name, target, key] of [
  ['findById', activeTimers, 'findById'],
  ['findRunning', activeTimers, 'findRunningByUserId'],
  ['findActionable', activeTimers, 'findActionableByUserId'],
  ['findPaused', activeTimers, 'findPausedByContext'],
  ['findIdempotent', activeTimers, 'findByStartIdempotencyKey'],
  ['listRunning', activeTimers, 'listRunning'],
  ['createTimer', activeTimers, 'createTimer'],
  ['updateTimer', activeTimers, 'updateTimer'],
  ['finalizeEntry', timeEntries, 'createFinalizedTimerEntry'],
  ['validate', validation, 'validateTimeEntry'],
  ['week', weeks, 'getOrCreateWeek'],
  ['assignment', projects, 'getAssignmentForUser'],
  ['started', sockets, 'emitActivityTimerStarted'],
  ['stopped', sockets, 'emitActivityTimerStopped'],
  ['connection', database, 'getV2Connection'],
]) originals[name] = { target, key, value: target[key] };

function req(userId = USER_ID, body = {}) {
  return { body, v2Activity: { userId }, v2Auth: { accountId: ACCOUNT_ID } };
}

function running(overrides = {}) {
  return {
    _id: TIMER_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    assignmentId: '507f1f77bcf86cd799439015',
    workCategoryId: CATEGORY_ID,
    startedAt: new Date(Date.now() - 10 * 60_000),
    sessionStartedAt: new Date(Date.now() - 10 * 60_000),
    accumulatedSeconds: 0,
    revision: 2,
    status: 'running',
    ...overrides,
  };
}

beforeEach(() => {
  activeTimers.findByStartIdempotencyKey = async () => null;
  activeTimers.findActionableByUserId = async () => null;
  activeTimers.findPausedByContext = async () => null;
  weeks.getOrCreateWeek = async () => ({ _id: '507f1f77bcf86cd799439020', status: 'draft' });
  validation.validateTimeEntry = async () => ({
    assignment: { allocation: { allowExceed: true } },
    budget: null,
  });
  projects.getAssignmentForUser = async () => ({ _id: '507f1f77bcf86cd799439015' });
  sockets.emitActivityTimerStarted = () => {};
  sockets.emitActivityTimerStopped = () => {};
});

afterEach(() => Object.values(originals).forEach(({ target, key, value }) => { target[key] = value; }));

test('normal start creates one canonical running timer', async () => {
  activeTimers.createTimer = async (payload) => ({ _id: TIMER_ID, ...payload });
  const result = await timerService.startTimer({
    projectId: PROJECT_ID,
    workCategoryId: CATEGORY_ID,
    idempotencyKey: 'start-normal-0001',
  }, ACCOUNT_ID, req());
  assert.equal(result.status, 'running');
  assert.equal(result.revision, 0);
});

test('double Start with the same key returns the original timer', async () => {
  const existing = running({ startIdempotencyKey: 'same-start-key' });
  activeTimers.findByStartIdempotencyKey = async () => existing;
  activeTimers.createTimer = async () => assert.fail('must not create another timer');
  const result = await timerService.startTimer({ idempotencyKey: 'same-start-key' }, ACCOUNT_ID, req());
  assert.equal(result.id, TIMER_ID);
});

test('different active timer returns structured canonical conflict', async () => {
  activeTimers.findActionableByUserId = async () => running();
  await assert.rejects(
    () => timerService.startTimer({ projectId: PROJECT_ID, workCategoryId: CATEGORY_ID }, ACCOUNT_ID, req()),
    (err) => err.code === 'ACTIVE_TIMER_EXISTS' && err.details.canonicalTimer.id === TIMER_ID,
  );
});

test('simultaneous multi-device Starts allow one winner through the unique-index conflict path', async () => {
  const canonical = running();
  let creates = 0;
  activeTimers.createTimer = async (payload) => {
    creates += 1;
    if (creates === 1) return { ...canonical, ...payload };
    const error = new Error('duplicate'); error.code = 11000; throw error;
  };
  activeTimers.findRunningByUserId = async () => canonical;
  const payload = { projectId: PROJECT_ID, workCategoryId: CATEGORY_ID };
  const outcomes = await Promise.allSettled([
    timerService.startTimer(payload, ACCOUNT_ID, req()),
    timerService.startTimer({ ...payload, taskId: '507f1f77bcf86cd799439017' }, ACCOUNT_ID, req()),
  ]);
  assert.equal(outcomes.filter((row) => row.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find((row) => row.status === 'rejected').reason.code, 'ACTIVE_TIMER_EXISTS');
});

test('normal Stop atomically closes and finalizes once', async () => {
  const timer = running();
  activeTimers.findById = async () => timer;
  activeTimers.updateTimer = async (_id, payload) => Object.assign(timer, payload, { revision: 3 });
  let entries = 0;
  timeEntries.createFinalizedTimerEntry = async () => { entries += 1; return { id: 'entry-1' }; };
  const result = await timerService.stopTimer(TIMER_ID, ACCOUNT_ID, req(USER_ID, { expectedVersion: 2 }));
  assert.equal(result.timer.status, 'stopped');
  assert.equal(entries, 1);
});

test('duplicate Stop and response-lost retry return one final entry', async () => {
  const timer = running();
  activeTimers.findById = async () => timer;
  activeTimers.updateTimer = async (_id, payload) => Object.assign(timer, payload, { revision: 3 });
  let entryCreates = 0;
  timeEntries.createFinalizedTimerEntry = async () => { entryCreates += 1; return { id: 'entry-1' }; };
  await timerService.stopTimer(TIMER_ID, ACCOUNT_ID, req());
  const retry = await timerService.stopTimer(TIMER_ID, ACCOUNT_ID, req());
  assert.equal(retry.timer.status, 'stopped');
  assert.equal(entryCreates, 2, 'service retries finalization; timerId unique index de-duplicates persistence');
});

test('stale expected version returns latest canonical timer', async () => {
  activeTimers.findById = async () => running({ revision: 5 });
  await assert.rejects(
    () => timerService.stopTimer(TIMER_ID, ACCOUNT_ID, req(USER_ID, { expectedVersion: 4 })),
    (err) => err.code === 'STALE_TIMER_VERSION' && err.details.canonicalTimer.revision === 5,
  );
});

test('heartbeat changes last-seen only and not worked duration or revision', async () => {
  const timer = running({ accumulatedSeconds: 123, revision: 8 });
  activeTimers.findById = async () => timer;
  let updateOptions;
  activeTimers.updateTimer = async (_id, payload, _session, options) => {
    updateOptions = options;
    assert.equal(payload.accumulatedSeconds, undefined);
    return { ...timer, ...payload };
  };
  const result = await timerService.heartbeatTimer(TIMER_ID, ACCOUNT_ID, req());
  assert.equal(result.accumulatedSeconds, 123);
  assert.equal(result.revision, 8);
  assert.equal(updateOptions.incrementRevision, false);
});

test('heartbeat loss from browser close or sleep never pauses a running timer', async () => {
  const timer = running({
    startedAt: new Date('2026-08-13T10:00:00.000Z'),
    lastHeartbeatAt: new Date('2026-08-13T10:01:00.000Z'),
    maxAccumulatedSeconds: 8 * 60 * 60,
  });
  activeTimers.listRunning = async () => [timer];
  activeTimers.updateTimer = async () => assert.fail('heartbeat loss must not change timer state');
  const result = await timerService.freezeOverdueTimers(new Date('2026-08-13T12:30:00.000Z'));
  assert.deepEqual(result, { inspected: 1, frozen: 0 });
});

test('canonical timer response flags configurable continuous tracking review without blocking Stop', async () => {
  const timer = running({
    startedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    reviewThresholdSeconds: 4 * 60 * 60,
  });
  activeTimers.findById = async () => timer;
  activeTimers.updateTimer = async (_id, payload) => ({ ...timer, ...payload });
  const result = await timerService.heartbeatTimer(TIMER_ID, ACCOUNT_ID, req());
  assert.equal(result.needsReview, true);
  assert.equal(result.reviewReason, 'continuous_tracking_threshold_exceeded');
  assert.ok(result.serverTime);
});

test('switch atomically stops the old timer and starts the new timer at one timestamp', async () => {
  const oldTimer = running();
  activeTimers.findById = async () => oldTimer;
  activeTimers.updateTimer = async (_id, payload) => ({ ...oldTimer, ...payload, revision: 3 });
  activeTimers.createTimer = async (payload) => ({ _id: '507f1f77bcf86cd799439088', ...payload });
  timeEntries.createFinalizedTimerEntry = async () => ({ id: 'entry-old' });
  database.getV2Connection = () => ({
    startSession: async () => ({
      withTransaction: async (work) => work(),
      endSession: async () => {},
    }),
  });
  const result = await timerService.switchTimer({
    currentTimerId: TIMER_ID,
    expectedVersion: 2,
    projectId: PROJECT_ID,
    workCategoryId: CATEGORY_ID,
    taskId: '507f1f77bcf86cd799439017',
    idempotencyKey: 'switch-task-0001',
  }, ACCOUNT_ID, req());
  assert.equal(result.stoppedTimer.status, 'stopped');
  assert.equal(result.timer.status, 'running');
  assert.equal(new Date(result.stoppedTimer.stoppedAt).getTime(), new Date(result.timer.startedAt).getTime());
});

test('archived/over-limit timer still stops because finalization bypasses new-start validation', async () => {
  const timer = running({ maxAccumulatedSeconds: 60 });
  activeTimers.findById = async () => timer;
  activeTimers.updateTimer = async (_id, payload) => Object.assign(timer, payload);
  validation.validateTimeEntry = async () => assert.fail('Stop must not revalidate project or limits');
  timeEntries.createFinalizedTimerEntry = async () => ({ id: 'entry-review', needsReview: true });
  const result = await timerService.stopTimer(TIMER_ID, ACCOUNT_ID, req());
  assert.equal(result.timer.status, 'stopped');
});

test('unauthorized user cannot stop or heartbeat another user timer', async () => {
  activeTimers.findById = async () => running();
  for (const operation of [
    () => timerService.stopTimer(TIMER_ID, ACCOUNT_ID, req(OTHER_USER_ID)),
    () => timerService.heartbeatTimer(TIMER_ID, ACCOUNT_ID, req(OTHER_USER_ID)),
  ]) {
    await assert.rejects(operation, (err) => err.code === 'ACTIVITY_FORBIDDEN');
  }
});
