const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_WORKFLOW_STATUSES } = require('../helpers/workflowDefaults.helper');
const { assertNoLegacyProjectRef } = require('../helpers/projectTaskMapping.helper');

test('default workflow statuses include backlog and done columns', () => {
  const keys = DEFAULT_WORKFLOW_STATUSES.map((row) => row.key);
  assert.ok(keys.includes('backlog'));
  assert.ok(keys.includes('todo'));
  assert.ok(keys.includes('done'));
});

test('assertNoLegacyProjectRef rejects legacy sourceId payloads', () => {
  const err = assertNoLegacyProjectRef({ projectRef: { sourceId: 123 } });
  assert.equal(err.code, 'TASK_LEGACY_MAPPING_REQUIRED');
});

test('assertNoLegacyProjectRef allows v2 projectId payloads', () => {
  assert.equal(assertNoLegacyProjectRef({ projectId: '507f1f77bcf86cd799439011' }), null);
});
