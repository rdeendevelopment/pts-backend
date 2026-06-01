const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEntryQuery } = require('../repositories/timeEntry.repository');
const { getWeekBounds, getDayBounds, getMonthBounds } = require('../helpers/week.helper');

const ASSIGNMENT_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const PROJECT_ID = '507f1f77bcf86cd799439013';
const EXCLUDE_ENTRY_ID = '507f1f77bcf86cd799439014';
const ENTRY_DATE = new Date('2026-05-19T12:00:00.000Z');

function buildCapQuery(capPeriod, entryDate = ENTRY_DATE) {
  let bounds;
  if (capPeriod === 'day') bounds = getDayBounds(entryDate);
  if (capPeriod === 'week') bounds = getWeekBounds(entryDate);
  if (capPeriod === 'month') bounds = getMonthBounds(entryDate);

  return buildEntryQuery({
    assignmentId: ASSIGNMENT_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    entryDateFrom: bounds.dayStart || bounds.weekStartDate || bounds.monthStart,
    entryDateTo: bounds.dayEnd || bounds.weekEndDate || bounds.monthEnd,
    statuses: ['submitted', 'approved'],
    excludeEntryId: EXCLUDE_ENTRY_ID,
  });
}

test('day cap query only counts same user, assignment, project, and day range', () => {
  const query = buildCapQuery('day');
  const { dayStart, dayEnd } = getDayBounds(ENTRY_DATE);

  assert.equal(String(query.assignmentId), ASSIGNMENT_ID);
  assert.equal(String(query.userId), USER_ID);
  assert.equal(String(query.projectId), PROJECT_ID);
  assert.deepEqual(query.status, { $in: ['submitted', 'approved'] });
  assert.equal(String(query._id.$ne), EXCLUDE_ENTRY_ID);
  assert.equal(query.entryDate.$gte.toISOString(), dayStart.toISOString());
  assert.equal(query.entryDate.$lte.toISOString(), dayEnd.toISOString());
});

test('week cap query only counts same user, assignment, project, and business week range', () => {
  const query = buildCapQuery('week');
  const { weekStartDate, weekEndDate } = getWeekBounds(ENTRY_DATE);

  assert.equal(String(query.assignmentId), ASSIGNMENT_ID);
  assert.equal(String(query.userId), USER_ID);
  assert.equal(String(query.projectId), PROJECT_ID);
  assert.equal(query.entryDate.$gte.toISOString(), weekStartDate.toISOString());
  assert.equal(query.entryDate.$lte.toISOString(), weekEndDate.toISOString());
});

test('month cap query only counts same user, assignment, project, and business month range', () => {
  const query = buildCapQuery('month');
  const { monthStart, monthEnd } = getMonthBounds(ENTRY_DATE);

  assert.equal(String(query.assignmentId), ASSIGNMENT_ID);
  assert.equal(String(query.userId), USER_ID);
  assert.equal(String(query.projectId), PROJECT_ID);
  assert.equal(query.entryDate.$gte.toISOString(), monthStart.toISOString());
  assert.equal(query.entryDate.$lte.toISOString(), monthEnd.toISOString());
});
