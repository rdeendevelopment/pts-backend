const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mapTaskRoleToAssignmentRole,
  mapAssignmentRoleToTaskRole,
  normalizeTaskMemberRole,
} = require('../helpers/taskMemberRole.helper');

test('mapTaskRoleToAssignmentRole maps admin to lead', () => {
  assert.equal(mapTaskRoleToAssignmentRole('admin'), 'lead');
  assert.equal(mapTaskRoleToAssignmentRole('member'), 'member');
  assert.equal(mapTaskRoleToAssignmentRole('viewer'), 'viewer');
});

test('mapAssignmentRoleToTaskRole maps lead to admin', () => {
  assert.equal(mapAssignmentRoleToTaskRole('lead'), 'admin');
  assert.equal(mapAssignmentRoleToTaskRole('member'), 'member');
});

test('normalizeTaskMemberRole defaults unknown roles to member', () => {
  assert.equal(normalizeTaskMemberRole('admin'), 'admin');
  assert.equal(normalizeTaskMemberRole('invalid'), 'member');
});
