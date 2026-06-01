const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeProjectName,
  generateProjectCode,
  normalizeTags,
  assertValidDateRange,
  resolveCompletedAt,
} = require('../helpers/project.helper');
const {
  countsTowardApprovedCapacity,
  countsAsPending,
  validateBudgetTypeForProject,
  resolveInitialBudgetStatus,
  mapBudgetTotals,
  sumBudgetConsumedMinutes,
} = require('../helpers/budget.helper');
const {
  calculateRemainingMinutes,
  calculateAvailableToAssignMinutes,
  calculateAvailableForAssignmentUpdate,
  assertAllocationWithinAvailable,
  defaultCanLogTimeForRole,
} = require('../helpers/assignment.helper');

test('normalizeProjectName lowercases and collapses whitespace', () => {
  assert.equal(normalizeProjectName('  Website   Redesign  '), 'website redesign');
});

test('generateProjectCode builds uppercase slug from name', () => {
  assert.equal(generateProjectCode('Website Redesign'), 'WEBSITE_REDESIGN');
});

test('normalizeTags trims, lowercases, and deduplicates', () => {
  assert.deepEqual(
    normalizeTags([' Enterprise ', 'enterprise', 'SaaS', '']),
    ['enterprise', 'saas']
  );
});

test('assertValidDateRange rejects due date before start date', () => {
  assert.throws(
    () => assertValidDateRange('2026-06-01', '2026-05-01'),
    (err) => err.code === 'PROJECT_INVALID_DATE_RANGE'
  );
});

test('resolveCompletedAt sets completedAt when entering completed status', () => {
  const completedAt = resolveCompletedAt('active', 'completed');
  assert.ok(completedAt instanceof Date);
});

test('resolveCompletedAt clears completedAt when leaving completed status', () => {
  const previous = new Date('2026-01-01');
  assert.equal(resolveCompletedAt('completed', 'active', previous), null);
});

test('budget status rules distinguish approved, pending, and inactive', () => {
  assert.equal(countsTowardApprovedCapacity('approved'), true);
  assert.equal(countsTowardApprovedCapacity('pending_admin_approval'), false);
  assert.equal(countsAsPending('pending_client_approval'), true);
  assert.equal(countsAsPending('rejected'), false);
});

test('mapBudgetTotals sums only approved and pending buckets', () => {
  const totals = mapBudgetTotals([
    { status: 'approved', approvedMinutes: 600, approvedAmount: 1000, isDeleted: false },
    { status: 'pending_admin_approval', requestedMinutes: 120, requestedAmount: 200, isDeleted: false },
    { status: 'rejected', approvedMinutes: 999, approvedAmount: 999, isDeleted: false },
  ]);

  assert.equal(totals.totalApprovedMinutes, 600);
  assert.equal(totals.totalApprovedAmount, 1000);
  assert.equal(totals.totalPendingMinutes, 120);
  assert.equal(totals.totalPendingAmount, 200);
});

test('sumBudgetConsumedMinutes sums approved budget consumption only', () => {
  const total = sumBudgetConsumedMinutes([
    { status: 'approved', consumedMinutes: 780, isDeleted: false },
    { status: 'approved', consumedMinutes: 0, isDeleted: false },
    { status: 'rejected', consumedMinutes: 999, isDeleted: false },
    { isDeleted: true, status: 'approved', consumedMinutes: 600 },
  ]);
  assert.equal(total, 780);
});

test('resolveInitialBudgetStatus auto-approves on active project when setting enabled', () => {
  const status = resolveInitialBudgetStatus(
    { status: 'active', settings: { autoApproveInitialBudgetOnActivation: true } },
    {}
  );
  assert.equal(status, 'approved');
});

test('validateBudgetTypeForProject enforces fixed_hours and fixed_budget rules', () => {
  assert.equal(validateBudgetTypeForProject('fixed_hours', 'hours').valid, true);
  assert.equal(validateBudgetTypeForProject('fixed_hours', 'money').valid, false);
  assert.equal(validateBudgetTypeForProject('fixed_budget', 'money').valid, true);
  assert.equal(validateBudgetTypeForProject('fixed_budget', 'hours').valid, false);
  assert.equal(validateBudgetTypeForProject('hybrid', 'hybrid').valid, true);
});

test('calculateAvailableToAssignMinutes subtracts assigned from approved', () => {
  assert.equal(calculateAvailableToAssignMinutes(600, 240), 360);
  assert.equal(calculateAvailableToAssignMinutes(240, 600), 0);
});

test('calculateAvailableForAssignmentUpdate adds current allocation back', () => {
  const stats = { totalApprovedMinutes: 600, totalAssignedMinutes: 500 };
  assert.equal(calculateAvailableForAssignmentUpdate(stats, 200), 300);
});

test('calculateRemainingMinutes never goes negative', () => {
  assert.equal(calculateRemainingMinutes(480, 120), 360);
  assert.equal(calculateRemainingMinutes(120, 480), 0);
});

test('assertAllocationWithinAvailable blocks when exceed not allowed', () => {
  const blocked = assertAllocationWithinAvailable({
    requestedMinutes: 500,
    availableMinutes: 300,
    allowBudgetExceed: false,
  });
  assert.equal(blocked.allowed, false);

  const allowed = assertAllocationWithinAvailable({
    requestedMinutes: 500,
    availableMinutes: 300,
    allowBudgetExceed: true,
  });
  assert.equal(allowed.allowed, true);
});

test('defaultCanLogTimeForRole disables logging for viewer', () => {
  assert.equal(defaultCanLogTimeForRole('viewer'), false);
  assert.equal(defaultCanLogTimeForRole('member'), true);
});
