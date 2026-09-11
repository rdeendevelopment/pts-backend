const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectTask } = require('../scripts/backfillPrimaryAssignees');

const projectId = '507f1f77bcf86cd799439011';
const userA = '507f1f77bcf86cd799439012';
const userB = '507f1f77bcf86cd799439013';

function query(result) {
  return { select() { return this; }, lean: async () => result };
}

test('migration selects first valid assignee and preserves multiple-assignee anomaly', async () => {
  const User = { findOne: ({ _id }) => query({ _id }) };
  const Assignment = { findOne: () => query({ _id: '507f1f77bcf86cd799439099' }) };
  const result = await inspectTask({ projectId, assignees: [{ userId: userA }, { userId: userB }] }, User, Assignment);
  assert.equal(String(result.primaryAssigneeId), userA);
  assert.deepEqual(result.anomalies, ['multiple_assignees']);
});

test('migration reports malformed, missing, and non-project assignees', async () => {
  const User = { findOne: ({ _id }) => query(String(_id) === userA ? null : { _id }) };
  const Assignment = { findOne: () => query(null) };
  const result = await inspectTask({ projectId, assignees: [{}, { userId: userA }, { userId: userB }] }, User, Assignment);
  assert.equal(result.primaryAssigneeId, null);
  assert.deepEqual(result.anomalies.sort(), [
    'assignee_not_on_project', 'malformed_assignee', 'missing_or_deleted_user', 'multiple_assignees',
  ]);
});

test('migration leaves tasks with no assignee unchanged', async () => {
  const result = await inspectTask({ projectId, assignees: [] }, {}, {});
  assert.equal(result.primaryAssigneeId, null);
  assert.deepEqual(result.anomalies, ['no_assignee']);
});
