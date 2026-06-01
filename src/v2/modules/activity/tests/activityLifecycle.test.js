const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const timeWeekService = require('../services/timeWeek.service');
const timeEntryService = require('../services/timeEntry.service');
const activityErrorCodes = require('../errors/activityErrorCodes');
const activitySocketEvents = require('../helpers/activitySocketEvents.helper');
const {
  ACCOUNT_ID,
  USER_ID,
  PROJECT_ID,
  BUDGET_ID,
  CATEGORY_ID,
  ENTRY_DATE,
  ENTRY_MINUTES,
  setupActivityLifecycleHarness,
  teardownActivityLifecycleHarness,
  getLifecycleStore,
  createDraftWeekWithEntry,
} = require('./helpers/activityLifecycle.harness');

function makeReq({ manage = false } = {}) {
  return {
    v2Activity: {
      userId: USER_ID,
      permissions: manage ? ['activity.manage', 'activity.view'] : ['activity.view'],
    },
  };
}

beforeEach(() => {
  setupActivityLifecycleHarness();
  activitySocketEvents.emitActivityWeekSubmitted = () => {};
  activitySocketEvents.emitActivityWeekApproved = () => {};
  activitySocketEvents.emitActivityWeekRejected = () => {};
});

afterEach(() => {
  teardownActivityLifecycleHarness();
});

test('flow 1: draft entry creation does not consume counters', async () => {
  const req = makeReq();
  const store = getLifecycleStore();
  const before = store.snapshotCounters();

  const { week, entry } = await createDraftWeekWithEntry(req);
  const after = store.snapshotCounters();

  assert.equal(week.status, 'draft');
  assert.equal(entry.status, 'draft');
  assert.equal(after.assignmentConsumed, before.assignmentConsumed);
  assert.equal(after.budgetConsumed, before.budgetConsumed);
  assert.equal(after.statsRecalcCalls, before.statsRecalcCalls);
  assert.equal(after.projectStatsConsumed, before.projectStatsConsumed);
});

test('flow 2: submit week consumes counters and updates statuses', async () => {
  const req = makeReq();
  const store = getLifecycleStore();
  const { week, entry } = await createDraftWeekWithEntry(req);
  const before = store.snapshotCounters();

  const submitted = await timeWeekService.submitWeek(week._id, ACCOUNT_ID, req);
  const after = store.snapshotCounters();
  const storedEntry = store.getEntry(entry.id || entry._id);

  assert.equal(submitted.status, 'submitted');
  assert.equal(storedEntry.status, 'submitted');
  assert.equal(after.assignmentConsumed, before.assignmentConsumed + ENTRY_MINUTES);
  assert.equal(after.budgetConsumed, before.budgetConsumed + ENTRY_MINUTES);
  assert.equal(after.assignmentRemaining, store.assignment.allocation.allocatedMinutes - ENTRY_MINUTES);
  assert.ok(after.statsRecalcCalls > before.statsRecalcCalls);
  assert.equal(after.projectStatsConsumed, ENTRY_MINUTES);
});

test('flow 3: reject submitted week reverses counters and unlocks entries', async () => {
  const req = makeReq({ manage: true });
  const store = getLifecycleStore();
  const { week } = await createDraftWeekWithEntry(req);
  await timeWeekService.submitWeek(week._id, ACCOUNT_ID, req);

  const beforeReject = store.snapshotCounters();
  const rejected = await timeWeekService.rejectWeek(week._id, ACCOUNT_ID, req, 'Needs changes');
  const afterReject = store.snapshotCounters();
  const entries = store.listEntries({ timeWeekId: week._id });

  assert.equal(rejected.status, 'rejected');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, 'draft');
  assert.equal(entries[0].isLocked, false);
  assert.equal(entries[0].lockedAt, null);
  assert.equal(afterReject.assignmentConsumed, 0);
  assert.equal(afterReject.budgetConsumed, 0);
  assert.ok(afterReject.statsRecalcCalls > beforeReject.statsRecalcCalls);
});

test('flow 4: re-submit rejected week consumes counters only once', async () => {
  const req = makeReq({ manage: true });
  const store = getLifecycleStore();
  const { week } = await createDraftWeekWithEntry(req);

  await timeWeekService.submitWeek(week._id, ACCOUNT_ID, req);
  await timeWeekService.rejectWeek(week._id, ACCOUNT_ID, req);
  assert.equal(store.snapshotCounters().assignmentConsumed, 0);

  await timeWeekService.submitWeek(week._id, ACCOUNT_ID, req);
  const counters = store.snapshotCounters();

  assert.equal(counters.assignmentConsumed, ENTRY_MINUTES);
  assert.equal(counters.budgetConsumed, ENTRY_MINUTES);
  assert.equal(store.getWeek(week._id).status, 'submitted');
});

test('flow 5: approve submitted week locks entries without double-consuming counters', async () => {
  const req = makeReq({ manage: true });
  const store = getLifecycleStore();
  const { week } = await createDraftWeekWithEntry(req);
  await timeWeekService.submitWeek(week._id, ACCOUNT_ID, req);

  const beforeApprove = store.snapshotCounters();
  const approved = await timeWeekService.approveWeek(week._id, ACCOUNT_ID, req);
  const afterApprove = store.snapshotCounters();
  const entries = store.listEntries({ timeWeekId: week._id });

  assert.equal(approved.status, 'approved');
  assert.equal(entries[0].status, 'approved');
  assert.equal(entries[0].isLocked, true);
  assert.ok(entries[0].lockedAt);
  assert.equal(afterApprove.assignmentConsumed, beforeApprove.assignmentConsumed);
  assert.equal(afterApprove.budgetConsumed, beforeApprove.budgetConsumed);
  assert.equal(afterApprove.statsRecalcCalls, beforeApprove.statsRecalcCalls);
});

test('flow 6: approved week and entries block further edits', async () => {
  const req = makeReq({ manage: true });
  const { week, entry } = await createDraftWeekWithEntry(req);
  await timeWeekService.submitWeek(week._id, ACCOUNT_ID, req);
  await timeWeekService.approveWeek(week._id, ACCOUNT_ID, req);

  const entryId = entry.id || entry._id;

  await assert.rejects(
    () => timeEntryService.updateEntry(entryId, { minutes: 90 }, ACCOUNT_ID, req),
    (err) => err.code === activityErrorCodes.ACTIVITY_WEEK_LOCKED
  );

  await assert.rejects(
    () => timeEntryService.deleteEntry(entryId, ACCOUNT_ID, req),
    (err) => err.code === activityErrorCodes.ACTIVITY_WEEK_LOCKED
  );

  await assert.rejects(
    () => timeEntryService.createEntry({
      projectId: PROJECT_ID,
      budgetId: BUDGET_ID,
      workCategoryId: CATEGORY_ID,
      entryDate: ENTRY_DATE,
      minutes: 30,
      timeWeekId: week._id,
    }, ACCOUNT_ID, req),
    (err) => err.code === activityErrorCodes.ACTIVITY_WEEK_LOCKED
  );
});

test('flow 7: lifecycle status guards fail cleanly on invalid transitions', async () => {
  const req = makeReq({ manage: true });
  const { week } = await createDraftWeekWithEntry(req);

  await timeWeekService.submitWeek(week._id, ACCOUNT_ID, req);

  await assert.rejects(
    () => timeWeekService.submitWeek(week._id, ACCOUNT_ID, req),
    (err) => err.code === activityErrorCodes.ACTIVITY_WEEK_INVALID_STATUS
  );

  await timeWeekService.approveWeek(week._id, ACCOUNT_ID, req);

  await assert.rejects(
    () => timeWeekService.approveWeek(week._id, ACCOUNT_ID, req),
    (err) => err.code === activityErrorCodes.ACTIVITY_WEEK_NOT_SUBMITTED
  );

  await assert.rejects(
    () => timeWeekService.rejectWeek(week._id, ACCOUNT_ID, req),
    (err) => err.code === activityErrorCodes.ACTIVITY_WEEK_NOT_SUBMITTED
  );
});
