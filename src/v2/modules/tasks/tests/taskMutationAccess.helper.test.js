const test = require('node:test');
const assert = require('node:assert/strict');
const { mapEventTypeToAction } = require('../helpers/taskActivity.dto.helper');
const { canEditProjectWithRole } = require('../helpers/taskCollaborator.helper');

test('mapEventTypeToAction maps moved events', () => {
  assert.equal(mapEventTypeToAction({ eventType: 'TASK_MOVED' }), 'moved');
});

test('canEditProjectWithRole allows project members to edit', () => {
  assert.equal(canEditProjectWithRole('member'), true);
  assert.equal(canEditProjectWithRole('viewer'), false);
});
