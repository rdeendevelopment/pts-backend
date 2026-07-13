const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  setupActivityLifecycleHarness,
  teardownActivityLifecycleHarness,
  createDraftWeekWithEntry,
  ACCOUNT_ID,
  USER_ID,
  PROJECT_ID,
  BUDGET_ID,
  CATEGORY_ID,
  ENTRY_MINUTES,
} = require('./helpers/activityLifecycle.harness');
const timeWeekService = require('../services/timeWeek.service');
const timerService = require('../services/timer.service');
const activitySocketEvents = require('../helpers/activitySocketEvents.helper');

const TIMER_ID = '507f1f77bcf86cd799439030';

function makeReq({ manage = false } = {}) {
  return {
    v2Activity: {
      userId: USER_ID,
      permissions: manage ? ['activity.manage', 'activity.view'] : ['activity.view'],
    },
  };
}

const socketCalls = {
  submitted: [],
  approved: [],
  rejected: [],
  timerStarted: [],
  timerStopped: [],
};

const savedSocketFns = {
  emitActivityWeekSubmitted: activitySocketEvents.emitActivityWeekSubmitted,
  emitActivityWeekApproved: activitySocketEvents.emitActivityWeekApproved,
  emitActivityWeekRejected: activitySocketEvents.emitActivityWeekRejected,
  emitActivityTimerStarted: activitySocketEvents.emitActivityTimerStarted,
  emitActivityTimerStopped: activitySocketEvents.emitActivityTimerStopped,
};

beforeEach(() => {
  socketCalls.submitted = [];
  socketCalls.approved = [];
  socketCalls.rejected = [];
  socketCalls.timerStarted = [];
  socketCalls.timerStopped = [];

  setupActivityLifecycleHarness();

  activitySocketEvents.emitActivityWeekSubmitted = (week, projectIds) => {
    socketCalls.submitted.push({ week, projectIds });
  };
  activitySocketEvents.emitActivityWeekApproved = (week, projectIds) => {
    socketCalls.approved.push({ week, projectIds });
  };
  activitySocketEvents.emitActivityWeekRejected = (week, projectIds) => {
    socketCalls.rejected.push({ week, projectIds });
  };
  activitySocketEvents.emitActivityTimerStarted = (userId, timer) => {
    socketCalls.timerStarted.push({ userId, timer });
  };
  activitySocketEvents.emitActivityTimerStopped = (userId, timer) => {
    socketCalls.timerStopped.push({ userId, timer });
  };
});

afterEach(() => {
  activitySocketEvents.emitActivityWeekSubmitted = savedSocketFns.emitActivityWeekSubmitted;
  activitySocketEvents.emitActivityWeekApproved = savedSocketFns.emitActivityWeekApproved;
  activitySocketEvents.emitActivityWeekRejected = savedSocketFns.emitActivityWeekRejected;
  activitySocketEvents.emitActivityTimerStarted = savedSocketFns.emitActivityTimerStarted;
  activitySocketEvents.emitActivityTimerStopped = savedSocketFns.emitActivityTimerStopped;
  teardownActivityLifecycleHarness();
});

async function seedSubmittedWeek(req) {
  const { week } = await createDraftWeekWithEntry(req);
  await timeWeekService.submitWeek(week._id, ACCOUNT_ID, req);
  return week;
}

test('submitWeek emits activity.week.submitted to helper with week payload and project ids', async () => {
  const req = makeReq();
  const { week } = await createDraftWeekWithEntry(req);

  await timeWeekService.submitWeek(week._id, ACCOUNT_ID, req);

  assert.equal(socketCalls.submitted.length, 1);
  assert.deepEqual(socketCalls.submitted[0].projectIds, [PROJECT_ID]);
  assert.equal(socketCalls.submitted[0].week.status, 'submitted');
  assert.equal(socketCalls.submitted[0].week.userId, USER_ID);
  assert.equal(socketCalls.submitted[0].week.totalMinutes, ENTRY_MINUTES);
  assert.equal(socketCalls.submitted[0].week.totalEntries, 1);
});

test('approveWeek emits activity.week.approved with approval metadata', async () => {
  const req = makeReq({ manage: true });
  const week = await seedSubmittedWeek(req);

  await timeWeekService.approveWeek(week._id, ACCOUNT_ID, req);

  assert.equal(socketCalls.approved.length, 1);
  assert.equal(socketCalls.approved[0].week.status, 'approved');
  assert.equal(socketCalls.approved[0].week.approvedBy, ACCOUNT_ID);
  assert.ok(socketCalls.approved[0].week.approvedAt);
  assert.ok(socketCalls.approved[0].week.lockedAt);
  assert.deepEqual(socketCalls.approved[0].projectIds, [PROJECT_ID]);
});

test('rejectWeek emits activity.week.rejected with rejection metadata', async () => {
  const req = makeReq({ manage: true });
  const week = await seedSubmittedWeek(req);

  await timeWeekService.rejectWeek(week._id, ACCOUNT_ID, req, 'Revise entries');

  assert.equal(socketCalls.rejected.length, 1);
  assert.equal(socketCalls.rejected[0].week.status, 'rejected');
  assert.equal(socketCalls.rejected[0].week.rejectedBy, ACCOUNT_ID);
  assert.ok(socketCalls.rejected[0].week.rejectedAt);
  assert.equal(socketCalls.rejected[0].week.rejectionReason, 'Revise entries');
  assert.deepEqual(socketCalls.rejected[0].projectIds, [PROJECT_ID]);
});

test('startTimer emits activity.timer.started through helper', async () => {
  const req = makeReq();
  const activeTimerRepository = require('../repositories/activeTimer.repository');
  const timeValidationService = require('../services/timeValidation.service');
  const projectsModule = require('../../projects');

  timeValidationService.validateTimerStart = async () => ({ canLog: true });
  projectsModule.getAssignmentForUser = async () => ({
    _id: '507f1f77bcf86cd799439011',
    userId: USER_ID,
    projectId: PROJECT_ID,
  });
  activeTimerRepository.createTimer = async (payload) => ({
    _id: TIMER_ID,
    ...payload,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await timerService.startTimer({
    projectId: PROJECT_ID,
    workCategoryId: CATEGORY_ID,
    budgetId: BUDGET_ID,
  }, ACCOUNT_ID, req);

  assert.equal(socketCalls.timerStarted.length, 1);
  assert.equal(socketCalls.timerStarted[0].userId, USER_ID);
  assert.equal(socketCalls.timerStarted[0].timer.projectId, PROJECT_ID);
  assert.equal(socketCalls.timerStarted[0].timer.status, 'running');
});

test('stopTimer emits activity.timer.stopped through helper', async () => {
  const req = makeReq();
  const activeTimerRepository = require('../repositories/activeTimer.repository');
  const timeEntryService = require('../services/timeEntry.service');

  const runningTimer = {
    _id: TIMER_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    assignmentId: '507f1f77bcf86cd799439011',
    workCategoryId: CATEGORY_ID,
    startedAt: new Date(Date.now() - 5 * 60 * 1000),
    status: 'running',
  };
  const stoppedTimer = {
    ...runningTimer,
    stoppedAt: new Date(),
    status: 'stopped',
  };
  let findByIdCalls = 0;

  activeTimerRepository.findById = async () => {
    findByIdCalls += 1;
    return findByIdCalls === 1 ? runningTimer : stoppedTimer;
  };
  activeTimerRepository.updateTimer = async (_id, payload) => ({
    ...runningTimer,
    stoppedAt: payload.stoppedAt,
    status: payload.status,
  });
  timeEntryService.createEntry = async () => ({ id: 'entry-1', minutes: 5 });

  await timerService.stopTimer(TIMER_ID, ACCOUNT_ID, req);

  assert.equal(socketCalls.timerStopped.length, 1);
  assert.equal(socketCalls.timerStopped[0].userId, USER_ID);
  assert.equal(socketCalls.timerStopped[0].timer.projectId, PROJECT_ID);
  assert.equal(socketCalls.timerStopped[0].timer.status, 'stopped');
  assert.equal(findByIdCalls, 1, 'stop should reuse the updated timer instead of reading it again');
});
