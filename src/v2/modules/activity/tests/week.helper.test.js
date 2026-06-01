const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const env = require('../../../config/env');
const {
  getWeekBounds,
  buildWeekDayKeys,
  formatDayKey,
  getWeekStartDay,
  normalizeWeekStartDay,
} = require('../helpers/week.helper');
const { buildWeeklyReport } = require('../dto/activity.dto');

const ENTRY_DATE = new Date('2026-05-19T12:00:00.000Z');
const TIMEZONE = 'UTC';
const PROJECT_ID = '507f1f77bcf86cd799439013';

const savedWeekStartDay = env.v2.weekStartDay;

beforeEach(() => {
  env.v2.weekStartDay = 'monday';
});

afterEach(() => {
  env.v2.weekStartDay = savedWeekStartDay;
});

test('normalizeWeekStartDay defaults invalid values to monday', () => {
  assert.equal(normalizeWeekStartDay('tuesday'), 'monday');
  assert.equal(normalizeWeekStartDay(''), 'monday');
  assert.equal(normalizeWeekStartDay('sunday'), 'sunday');
});

test('getWeekBounds uses monday week start (Monday through Sunday)', () => {
  env.v2.weekStartDay = 'monday';

  const { weekStartDate, weekEndDate, weekStartDay } = getWeekBounds(ENTRY_DATE, TIMEZONE);

  assert.equal(weekStartDay, 'monday');
  assert.equal(formatDayKey(weekStartDate, TIMEZONE), '2026-05-18');
  assert.equal(formatDayKey(weekEndDate, TIMEZONE), '2026-05-24');
  assert.equal(getWeekStartDay(), 'monday');
});

test('getWeekBounds uses sunday week start (Sunday through Saturday)', () => {
  env.v2.weekStartDay = 'sunday';

  const { weekStartDate, weekEndDate, weekStartDay } = getWeekBounds(ENTRY_DATE, TIMEZONE);

  assert.equal(weekStartDay, 'sunday');
  assert.equal(formatDayKey(weekStartDate, TIMEZONE), '2026-05-17');
  assert.equal(formatDayKey(weekEndDate, TIMEZONE), '2026-05-23');
});

test('buildWeekDayKeys returns exactly seven consecutive business days', () => {
  const { weekStartDate } = getWeekBounds(ENTRY_DATE, TIMEZONE, 'monday');
  const dayKeys = buildWeekDayKeys(weekStartDate, TIMEZONE);

  assert.equal(dayKeys.length, 7);
  assert.deepEqual(dayKeys, [
    '2026-05-18',
    '2026-05-19',
    '2026-05-20',
    '2026-05-21',
    '2026-05-22',
    '2026-05-23',
    '2026-05-24',
  ]);
});

test('buildWeeklyReport returns seven days from week document boundaries', () => {
  const { weekStartDate } = getWeekBounds(ENTRY_DATE, TIMEZONE, 'monday');
  const report = buildWeeklyReport(
    [{
      _id: '507f1f77bcf86cd799439014',
      timeWeekId: '507f1f77bcf86cd799439020',
      projectId: PROJECT_ID,
      assignmentId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439012',
      workCategoryId: '507f1f77bcf86cd799439016',
      entryDate: new Date('2026-05-19T15:00:00.000Z'),
      minutes: 60,
      source: 'manual',
      status: 'draft',
    }],
    { weekStartDate, timezone: TIMEZONE }
  );

  assert.equal(report.days.length, 7);
  assert.equal(report.weeklyTotalMinutes, 60);
  assert.equal(report.days[0].date, '2026-05-18');
  assert.equal(report.days[0].totalMinutes, 0);
  assert.equal(report.days[1].date, '2026-05-19');
  assert.equal(report.days[1].totalMinutes, 60);
  assert.equal(report.days[1].projects[0].totalMinutes, 60);
  assert.equal(report.days[6].date, '2026-05-24');
});

test('buildWeeklyReport with sunday week start spans Sunday through Saturday', () => {
  const { weekStartDate } = getWeekBounds(ENTRY_DATE, TIMEZONE, 'sunday');
  const report = buildWeeklyReport([], { weekStartDate, timezone: TIMEZONE });

  assert.equal(report.days.length, 7);
  assert.equal(report.days[0].date, '2026-05-17');
  assert.equal(report.days[6].date, '2026-05-23');
  assert.equal(report.weeklyTotalMinutes, 0);
});
