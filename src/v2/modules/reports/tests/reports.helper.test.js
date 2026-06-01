const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../../../config/env');
const { buildDateRange } = require('../helpers/dateRange.helper');
const { normalizeReportStatusFilter } = require('../helpers/statusFilter.helper');
const { minutesToHours } = require('../helpers/formatting.helper');
const {
  groupEntriesByDay,
  groupEntriesByProject,
} = require('../helpers/grouping.helper');
const { formatDayKey, getWeekBounds } = require('../../activity/helpers/week.helper');

const ANCHOR_DATE = new Date('2026-05-19T12:00:00.000Z');
const TIMEZONE = 'UTC';
const savedWeekStartDay = env.v2.weekStartDay;

beforeEach(() => {
  env.v2.weekStartDay = 'monday';
});

afterEach(() => {
  env.v2.weekStartDay = savedWeekStartDay;
});

test('buildDateRange daily uses single business day', () => {
  const range = buildDateRange({
    period: 'daily',
    startDate: ANCHOR_DATE,
    timeZone: TIMEZONE,
  });

  assert.equal(range.period, 'daily');
  assert.equal(formatDayKey(range.startDate, TIMEZONE), '2026-05-19');
  assert.equal(formatDayKey(range.endDate, TIMEZONE), '2026-05-19');
});

test('buildDateRange weekly follows monday week start config', () => {
  env.v2.weekStartDay = 'monday';
  const range = buildDateRange({ period: 'weekly', anchorDate: ANCHOR_DATE, timeZone: TIMEZONE });

  assert.equal(formatDayKey(range.startDate, TIMEZONE), '2026-05-18');
  assert.equal(formatDayKey(range.endDate, TIMEZONE), '2026-05-24');
});

test('buildDateRange weekly follows sunday week start config', () => {
  env.v2.weekStartDay = 'sunday';
  const range = buildDateRange({ period: 'weekly', anchorDate: ANCHOR_DATE, timeZone: TIMEZONE });

  assert.equal(formatDayKey(range.startDate, TIMEZONE), '2026-05-17');
  assert.equal(formatDayKey(range.endDate, TIMEZONE), '2026-05-23');
});

test('buildDateRange bi_weekly spans fourteen days aligned to week config', () => {
  env.v2.weekStartDay = 'monday';
  const range = buildDateRange({ period: 'bi_weekly', anchorDate: ANCHOR_DATE, timeZone: TIMEZONE });
  const spanDays = Math.round((range.endDate - range.startDate) / 86400000);

  assert.ok(spanDays >= 13 && spanDays <= 14);
  assert.equal(formatDayKey(range.startDate, TIMEZONE), '2026-05-18');
  assert.equal(formatDayKey(range.endDate, TIMEZONE), '2026-05-31');
});

test('buildDateRange monthly covers full business month', () => {
  const range = buildDateRange({ period: 'monthly', anchorDate: ANCHOR_DATE, timeZone: TIMEZONE });

  assert.equal(formatDayKey(range.startDate, TIMEZONE), '2026-05-01');
  assert.equal(formatDayKey(range.endDate, TIMEZONE), '2026-05-31');
});

test('buildDateRange custom requires startDate and endDate', () => {
  assert.throws(
    () => buildDateRange({ period: 'custom' }),
    (err) => err.code === 'REPORT_INVALID_DATE_RANGE'
  );

  const range = buildDateRange({
    period: 'custom',
    startDate: '2026-05-01T00:00:00.000Z',
    endDate: '2026-05-10T00:00:00.000Z',
    timeZone: TIMEZONE,
  });

  assert.equal(range.period, 'custom');
  assert.ok(range.startDate <= range.endDate);
});

test('normalizeReportStatusFilter defaults managers to submitted and approved', () => {
  const result = normalizeReportStatusFilter(undefined, { canManageReports: true });
  assert.deepEqual(result.statuses, ['submitted', 'approved']);
  assert.equal(result.explicit, false);
});

test('normalizeReportStatusFilter defaults self users to all entry statuses', () => {
  const result = normalizeReportStatusFilter(undefined, { canManageReports: false });
  assert.deepEqual(result.statuses, ['draft', 'submitted', 'approved', 'rejected']);
});

test('normalizeReportStatusFilter honors explicit status', () => {
  const result = normalizeReportStatusFilter('draft', { canManageReports: true });
  assert.deepEqual(result.statuses, ['draft']);
  assert.equal(result.explicit, true);
});

test('groupEntriesByDay aggregates minutes per business day', () => {
  const grouped = groupEntriesByDay([
    { entryDate: new Date('2026-05-19T10:00:00.000Z'), minutes: 60 },
    { entryDate: new Date('2026-05-19T15:00:00.000Z'), minutes: 30 },
    { entryDate: new Date('2026-05-20T09:00:00.000Z'), minutes: 45 },
  ], TIMEZONE);

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].date, '2026-05-19');
  assert.equal(grouped[0].totalMinutes, 90);
  assert.equal(grouped[0].totalEntries, 2);
  assert.equal(grouped[1].totalMinutes, 45);
});

test('groupEntriesByProject aggregates minutes per project', () => {
  const grouped = groupEntriesByProject([
    { projectId: '507f1f77bcf86cd799439013', minutes: 60 },
    { projectId: '507f1f77bcf86cd799439013', minutes: 15 },
    { projectId: '507f1f77bcf86cd799439014', minutes: 45 },
  ]);

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].projectId, '507f1f77bcf86cd799439013');
  assert.equal(grouped[0].totalMinutes, 75);
  assert.equal(grouped[0].totalHours, 1.25);
});

test('minutesToHours converts with two decimal places', () => {
  assert.equal(minutesToHours(90), 1.5);
  assert.equal(minutesToHours(0), 0);
});

test('weekly report date range matches activity getWeekBounds helper', () => {
  env.v2.weekStartDay = 'sunday';
  const reportRange = buildDateRange({ period: 'weekly', anchorDate: ANCHOR_DATE, timeZone: TIMEZONE });
  const activityRange = getWeekBounds(ANCHOR_DATE, TIMEZONE, 'sunday');

  assert.equal(reportRange.startDate.toISOString(), activityRange.weekStartDate.toISOString());
  assert.equal(reportRange.endDate.toISOString(), activityRange.weekEndDate.toISOString());
});
