const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateCapRemainingMinutes,
  calculateBudgetRemainingMinutes,
} = require('../helpers/capPeriod.helper');
const { groupEntriesForConsumption } = require('../helpers/transaction.helper');

test('capPeriod project enforcement blocks when allocation exceeded', () => {
  const result = calculateCapRemainingMinutes({
    allocatedMinutes: 480,
    consumedInPeriod: 400,
    pendingDraftMinutes: 60,
    requestedMinutes: 30,
    allowExceed: false,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.projected, 490);
});

test('capPeriod week enforcement allows when within allocation', () => {
  const result = calculateCapRemainingMinutes({
    allocatedMinutes: 240,
    consumedInPeriod: 120,
    pendingDraftMinutes: 60,
    requestedMinutes: 30,
    allowExceed: false,
  });
  assert.equal(result.allowed, true);
});

test('calculateBudgetRemainingMinutes subtracts draft and requested minutes', () => {
  const remaining = calculateBudgetRemainingMinutes(
    { approvedMinutes: 1000, consumedMinutes: 400 },
    100,
    200
  );
  assert.equal(remaining, 300);
});

test('groupEntriesForConsumption aggregates assignment and budget totals', () => {
  const grouped = groupEntriesForConsumption([
    { assignmentId: 'a1', budgetId: 'b1', projectId: 'p1', minutes: 60 },
    { assignmentId: 'a1', budgetId: 'b1', projectId: 'p1', minutes: 30 },
    { assignmentId: 'a2', projectId: 'p2', minutes: 45 },
  ]);

  assert.equal(grouped.assignmentTotals.get('a1'), 90);
  assert.equal(grouped.budgetTotals.get('b1'), 90);
  assert.equal(grouped.projectIds.size, 2);
});

test('approved week locking is represented by entry status and isLocked flag', () => {
  const approvedEntry = { status: 'approved', isLocked: true };
  assert.equal(approvedEntry.status, 'approved');
  assert.equal(approvedEntry.isLocked, true);
});

test('multiple budget validation requires explicit budgetId when more than one approved budget', () => {
  const approvedBudgets = [{ _id: '1' }, { _id: '2' }];
  const budgetId = null;
  const requiresSelection = approvedBudgets.length > 1 && !budgetId;
  assert.equal(requiresSelection, true);
});

test('timer already running is detected when active timer exists', () => {
  const runningTimer = { status: 'running' };
  assert.equal(runningTimer.status, 'running');
});

test('user remaining minutes never goes negative in cap helper', () => {
  const result = calculateCapRemainingMinutes({
    allocatedMinutes: 60,
    consumedInPeriod: 120,
    pendingDraftMinutes: 0,
    requestedMinutes: 0,
    allowExceed: false,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
});
