const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSelfScopeConditions,
  buildMyTasksScopeConditions,
} = require('../services/taskAggregate.service');

const userId = '507f1f77bcf86cd799439011';
const projectId = '507f1f77bcf86cd799439012';
const taskId = '507f1f77bcf86cd799439013';
const collabTaskId = '507f1f77bcf86cd799439014';

test('buildSelfScopeConditions includes collaborator task ids', () => {
  const conditions = buildSelfScopeConditions(userId, [projectId], [taskId], [collabTaskId]);
  assert.equal(conditions.length, 4);
  assert.deepEqual(conditions[3], { _id: { $in: [collabTaskId] } });
});

test('buildMyTasksScopeConditions includes collaborator task ids', () => {
  const conditions = buildMyTasksScopeConditions(userId, [projectId], [], [collabTaskId]);
  assert.equal(conditions.length, 2);
  assert.deepEqual(conditions[1], { _id: { $in: [collabTaskId] } });
});

test('buildMyTasksScopeConditions returns empty without assignments or collaborators', () => {
  const conditions = buildMyTasksScopeConditions(userId, [], [], []);
  assert.deepEqual(conditions, []);
});
