const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  parseInsertStatement,
  extractPhase1TablesFromSqlFile,
} = require('../parsers/sqlInsertStream.parser');

test('parseInsertStatement handles escaped strings and NULL', () => {
  const sql = "INSERT INTO `users` (`id`, `email`, `password`) VALUES (1, 'a@b.com', '$2b$10$abc'), (2, NULL, 'x');";
  const parsed = parseInsertStatement(sql);
  assert.equal(parsed.table, 'users');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].email, 'a@b.com');
  assert.equal(parsed.rows[1].email, null);
});

test('extractPhase1TablesFromSqlFile reads legacy dump counts', async () => {
  const filePath = path.resolve(__dirname, '../../../../../../../legacy/u185411446_prodpts.sql');
  const { stats } = await extractPhase1TablesFromSqlFile(filePath);
  assert.ok(stats.counts.users >= 20);
  assert.ok(stats.counts.clients >= 100);
  assert.ok(stats.counts.projects >= 100);
  assert.ok(stats.counts.project_users >= 100);
  assert.equal(stats.counts.admins, 1);
  assert.equal(stats.counts.project_default_tasks, 14);
});
