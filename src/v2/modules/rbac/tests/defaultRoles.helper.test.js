const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePermissionKeysForRole } = require('../helpers/defaultRoles.helper');

const ALL_KEYS = [
  'auth.me',
  'modules.view',
  'modules.manage',
  'rbac.view',
  'projects.view',
  'budgets.view',
  'activity.view',
  'activity.view_all',
  'clock_activity.view',
  'tasks.view',
  'converse.view',
];

const PERMISSIONS_BY_KEY = {
  'auth.me': { category: 'system' },
  'modules.view': { category: 'view' },
  'modules.manage': { category: 'manage' },
  'rbac.view': { category: 'view' },
  'projects.view': { category: 'view' },
  'budgets.view': { category: 'view' },
};

test('super_admin receives all permissions', () => {
  const keys = resolvePermissionKeysForRole('super_admin', ALL_KEYS, PERMISSIONS_BY_KEY);
  assert.deepEqual(keys, ALL_KEYS);
});

test('admin excludes system category permissions', () => {
  const keys = resolvePermissionKeysForRole('admin', ALL_KEYS, PERMISSIONS_BY_KEY);
  assert.equal(keys.includes('auth.me'), false);
  assert.equal(keys.includes('modules.view'), true);
});

test('employee receives minimal work permissions', () => {
  const keys = resolvePermissionKeysForRole('employee', ALL_KEYS, PERMISSIONS_BY_KEY);
  assert.deepEqual(keys, [
    'auth.me',
    'modules.view',
    'projects.view',
    'budgets.view',
    'activity.view',
    'clock_activity.view',
    'tasks.view',
    'converse.view',
  ]);
});

test('manager receives activity view-all while employee does not', () => {
  const manager = resolvePermissionKeysForRole('manager', ALL_KEYS, PERMISSIONS_BY_KEY);
  const employee = resolvePermissionKeysForRole('employee', ALL_KEYS, PERMISSIONS_BY_KEY);

  assert.equal(manager.includes('activity.view_all'), true);
  assert.equal(employee.includes('activity.view_all'), false);
});
