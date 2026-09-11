const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { buildPersonalScope } = require('../services/taskPersonalDashboard.service');

test('personal dashboard scope contains only responsibility and active collaborator paths', () => {
  const userId = new Types.ObjectId();
  const collaboratorTaskId = new Types.ObjectId();
  const scope = buildPersonalScope(userId, [collaboratorTaskId]);

  assert.equal(scope.isDeleted, false);
  assert.deepEqual(scope.$or[0], { primaryAssigneeId: userId });
  assert.deepEqual(scope.$or[1], { 'assignees.userId': userId });
  assert.equal(String(scope.$or[2]._id.$in[0]), String(collaboratorTaskId));
  assert.equal(scope.$or.some((condition) => Object.hasOwn(condition, 'projectId')), false);
  assert.equal(scope.$or.some((condition) => Object.hasOwn(condition, 'createdBy')), false);
});

test('personal dashboard scope is safe when the user has no collaborations', () => {
  const scope = buildPersonalScope(new Types.ObjectId(), []);
  assert.deepEqual(scope.$or[2]._id.$in, []);
});
