const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  extractPhase2TablesFromSqlFile,
} = require('../parsers/sqlInsertStream.parser');
const {
  buildDailyNotesIndex,
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
