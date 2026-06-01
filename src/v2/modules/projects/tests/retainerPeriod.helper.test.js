const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clampRenewalDay,
  getRetainerPeriodBounds,
  getNextRetainerPeriod,
  isDateInPeriod,
  formatRetainerPeriodLabel,
  budgetCountsForRetainerCapacity,
} = require('../helpers/retainerPeriod.helper');

test('clampRenewalDay keeps values between 1 and 28', () => {
  assert.equal(clampRenewalDay(0), 1);
  assert.equal(clampRenewalDay(15), 15);
  assert.equal(clampRenewalDay(31), 28);
});

test('getRetainerPeriodBounds uses renewal day as cycle start', () => {
  const ref = new Date(Date.UTC(2026, 4, 20, 12, 0, 0));
  const { periodStart, periodEnd } = getRetainerPeriodBounds(ref, 15);

  assert.equal(periodStart.toISOString(), '2026-05-15T00:00:00.000Z');
  assert.equal(periodEnd.toISOString(), '2026-06-14T23:59:59.999Z');
});

test('getRetainerPeriodBounds rolls back before renewal day', () => {
  const ref = new Date(Date.UTC(2026, 4, 10, 12, 0, 0));
  const { periodStart, periodEnd } = getRetainerPeriodBounds(ref, 15);

  assert.equal(periodStart.toISOString(), '2026-04-15T00:00:00.000Z');
  assert.equal(periodEnd.toISOString(), '2026-05-14T23:59:59.999Z');
});

test('getNextRetainerPeriod advances one cycle', () => {
  const current = getRetainerPeriodBounds(new Date(Date.UTC(2026, 0, 20)), 1);
  const next = getNextRetainerPeriod(current.periodStart, 1);

  assert.equal(next.periodStart.toISOString(), '2026-02-01T00:00:00.000Z');
  assert.equal(next.periodEnd.toISOString(), '2026-02-28T23:59:59.999Z');
});

test('budgetCountsForRetainerCapacity only includes current retainer cycle', () => {
  const current = getRetainerPeriodBounds(new Date(Date.UTC(2026, 4, 20)), 1);
  const previous = getRetainerPeriodBounds(new Date(Date.UTC(2026, 3, 20)), 1);

  const currentBudget = {
    entryType: 'retainer_cycle',
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    isDeleted: false,
  };
  const previousBudget = {
    entryType: 'retainer_cycle',
    periodStart: previous.periodStart,
    periodEnd: previous.periodEnd,
    isDeleted: false,
  };

  assert.equal(
    budgetCountsForRetainerCapacity(currentBudget, new Date(Date.UTC(2026, 4, 20)), 1),
    true,
  );
  assert.equal(
    budgetCountsForRetainerCapacity(previousBudget, new Date(Date.UTC(2026, 4, 20)), 1),
    false,
  );
});

test('formatRetainerPeriodLabel renders readable range', () => {
  const { periodStart, periodEnd } = getRetainerPeriodBounds(new Date(Date.UTC(2026, 4, 20)), 15);
  assert.equal(
    formatRetainerPeriodLabel(periodStart, periodEnd),
    'May 15, 2026 – June 14, 2026',
  );
});

test('isDateInPeriod validates inclusive bounds', () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const end = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));
  assert.equal(isDateInPeriod(new Date(Date.UTC(2026, 0, 15)), start, end), true);
  assert.equal(isDateInPeriod(new Date(Date.UTC(2026, 1, 1)), start, end), false);
});
