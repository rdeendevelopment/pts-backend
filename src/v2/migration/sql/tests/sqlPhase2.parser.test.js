const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  extractPhase2TablesFromSqlFile,
} = require('../parsers/sqlInsertStream.parser');
const {
  buildDailyNotesIndex,
  buildTimeEntryPayload,
  expandSqlWorkingHoursRow,
} = require('../transformers/sqlActivity.transformer');

test('extractPhase2TablesFromSqlFile reads working_hours and daily_notes', async () => {
  const filePath = path.resolve(__dirname, '../../../../../../../legacy/u185411446_prodpts.sql');
  const { stats } = await extractPhase2TablesFromSqlFile(filePath);
  assert.ok(stats.counts.working_hours >= 1000);
  assert.ok(stats.counts.daily_notes >= 1);
});

test('expandSqlWorkingHoursRow expands day columns with notes', () => {
  const notes = buildDailyNotesIndex([
    { working_hours_id: 10, day_of_week: 'mon', note: 'Test note' },
  ]);
  const rows = expandSqlWorkingHoursRow({
    id: 10,
    project_id: 1,
    user_id: 2,
    task_id: 3,
    week_ending: '2014-01-12',
    mon: 1.5,
    tue: 0,
    wed: 0,
    thu: 0,
    fri: 0,
    sat: 0,
    sun: 0,
    is_deleted: 0,
    created_at: '2023-04-28 05:06:44',
    updated_at: '2023-04-28 05:06:44',
  }, notes);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].minutes, 90);
  assert.equal(rows[0].description, 'Test note');
});

test('buildTimeEntryPayload preserves legacy approval lifecycle', () => {
  const base = {
    timeWeekId: '507f1f77bcf86cd799439011',
    projectId: '507f1f77bcf86cd799439012',
    assignmentId: '507f1f77bcf86cd799439013',
    userId: '507f1f77bcf86cd799439014',
    budgetId: null,
    workCategoryId: '507f1f77bcf86cd799439015',
  };
  const entry = {
    entryDate: new Date('2014-01-06T12:00:00.000Z'),
    minutes: 60,
    updatedAt: new Date('2014-01-07T12:00:00.000Z'),
  };

  const draft = buildTimeEntryPayload({ ...base, entry: { ...entry } });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.isLocked, false);
  assert.equal(draft.approvedAt, null);

  const submitted = buildTimeEntryPayload({
    ...base,
    entry: { ...entry, submitted: true },
  });
  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.isLocked, true);
  assert.equal(submitted.approvedAt, null);

  const approved = buildTimeEntryPayload({
    ...base,
    entry: { ...entry, submitted: true, verified: true },
  });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.isLocked, true);
  assert.deepEqual(approved.approvedAt, entry.updatedAt);
});
