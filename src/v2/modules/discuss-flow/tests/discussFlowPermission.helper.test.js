const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { hasTopicRole, isWorkspaceOwner } = require('../helpers/discussFlowPermission.helper');

describe('discussFlowPermission.helper', () => {
  it('detects workspace owner', () => {
    assert.equal(isWorkspaceOwner('abc', { ownerId: 'abc' }), true);
    assert.equal(isWorkspaceOwner('abc', { ownerId: 'xyz' }), false);
  });

  it('ranks topic roles', () => {
    assert.equal(hasTopicRole({ role: 'manager' }, 'contributor'), true);
    assert.equal(hasTopicRole({ role: 'viewer' }, 'commenter'), false);
    assert.equal(hasTopicRole({ role: 'owner' }, 'manager'), true);
  });
});
