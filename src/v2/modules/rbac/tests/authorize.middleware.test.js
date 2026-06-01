const test = require('node:test');
const assert = require('node:assert/strict');
const { hasRequiredPermissions } = require('../helpers/authorize.helper');

test('hasRequiredPermissions requires all keys in all mode', () => {
  assert.equal(
    hasRequiredPermissions(['modules.view', 'modules.manage'], ['modules.view', 'modules.manage'], 'all'),
    true
  );
  assert.equal(
    hasRequiredPermissions(['modules.view'], ['modules.manage'], 'all'),
    false
  );
});

test('hasRequiredPermissions accepts any matching key in any mode', () => {
  assert.equal(
    hasRequiredPermissions(['rbac.view'], ['rbac.view', 'rbac.manage'], 'any'),
    true
  );
  assert.equal(
    hasRequiredPermissions(['modules.view'], ['rbac.view', 'rbac.manage'], 'any'),
    false
  );
});

test('hasRequiredPermissions allows empty requirement lists', () => {
  assert.equal(hasRequiredPermissions([], [], 'all'), true);
});
