const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertBudgetCancellable,
  assertBudgetEditable,
  calculateApprovedMinutesAfterRemoval,
  normalizeSignedMinutes,
} = require('../helpers/budget.lifecycle.helper');
const { mapBudgetTotals } = require('../helpers/budget.helper');

const projectId = '507f1f77bcf86cd799439011';

function makeBudget(overrides = {}) {
  return {
    _id: overrides._id || '507f1f77bcf86cd799439012',
    projectId,
    title: overrides.title || 'Budget',
    entryType: overrides.entryType || 'initial',
    approvalStatus: overrides.approvalStatus || 'pending',
    status: overrides.status,
    approvedMinutes: overrides.approvedMinutes ?? 0,
    requestedMinutes: overrides.requestedMinutes ?? 600,
    consumedMinutes: overrides.consumedMinutes ?? 0,
    isDeleted: false,
    ...overrides,
  };
}

test('pending budget cancellation is allowed', () => {
  const budget = makeBudget({ approvalStatus: 'pending', status: 'pending_admin_approval' });
  assert.doesNotThrow(() => assertBudgetCancellable(budget, [budget], {}));
});

test('approved budget with consumedMinutes > 0 cannot cancel', () => {
  const budget = makeBudget({
    approvalStatus: 'approved',
    approvedMinutes: 600,
    consumedMinutes: 60,
  });

  assert.throws(
    () => assertBudgetCancellable(budget, [budget], { totalAssignedMinutes: 0, totalConsumedMinutes: 60 }),
    (err) => err.code === 'PROJECT_BUDGET_CANCEL_BLOCKED_CONSUMED'
  );
});

test('approved budget cancellation blocked when remaining approved capacity is below assigned', () => {
  const budget = makeBudget({
    _id: 'budget-a',
    approvalStatus: 'approved',
    approvedMinutes: 600,
  });
  const other = makeBudget({
    _id: 'budget-b',
    approvalStatus: 'approved',
    approvedMinutes: 300,
  });

  assert.throws(
    () => assertBudgetCancellable(
      budget,
      [budget, other],
      { totalAssignedMinutes: 500, totalConsumedMinutes: 0 }
    ),
    (err) => err.code === 'PROJECT_BUDGET_CANCEL_BLOCKED_ASSIGNED'
  );
});

test('approved budget cancellation allowed when no consumed minutes and capacity remains sufficient', () => {
  const budget = makeBudget({
    _id: 'budget-a',
    approvalStatus: 'approved',
    approvedMinutes: 600,
  });
  const other = makeBudget({
    _id: 'budget-b',
    approvalStatus: 'approved',
    approvedMinutes: 300,
  });

  assert.doesNotThrow(() => assertBudgetCancellable(
    budget,
    [budget, other],
    { totalAssignedMinutes: 200, totalConsumedMinutes: 0 }
  ));
});

test('negative adjustment reduces approved capacity totals', () => {
  const budgets = [
    makeBudget({ approvalStatus: 'approved', approvedMinutes: 6000 }),
    makeBudget({
      _id: 'adjustment-1',
      entryType: 'adjustment',
      approvalStatus: 'approved',
      approvedMinutes: -1800,
      requestedMinutes: -1800,
    }),
  ];

  const totals = mapBudgetTotals(budgets);
  assert.equal(totals.totalApprovedMinutes, 4200);
  assert.equal(normalizeSignedMinutes(-1800, 'adjustment'), -1800);
});

test('stats totals recalculate after budget cancellation removes approved capacity', () => {
  const active = makeBudget({
    _id: 'active-budget',
    approvalStatus: 'approved',
    approvedMinutes: 600,
  });
  const cancelled = makeBudget({
    _id: 'cancel-budget',
    approvalStatus: 'cancelled',
    approvedMinutes: 0,
    requestedMinutes: 300,
  });

  const before = mapBudgetTotals([active, cancelled]);
  const afterCancel = calculateApprovedMinutesAfterRemoval([active, cancelled], active);

  assert.equal(before.totalApprovedMinutes, 600);
  assert.equal(afterCancel, 0);
});

test('approved budget amounts cannot be edited directly', () => {
  const budget = makeBudget({ approvalStatus: 'approved', approvedMinutes: 600 });

  assert.throws(
    () => assertBudgetEditable(budget, { approvedMinutes: 300 }),
    (err) => err.code === 'PROJECT_BUDGET_EDIT_BLOCKED'
  );
});
