const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidRoleKey,
  isValidPermissionKey,
  moduleKeyFromPermissionKey,
} = require('../helpers/permissionKey.helper');

test('isValidRoleKey accepts lowercase snake_case', () => {
  assert.equal(isValidRoleKey('super_admin'), true);
  assert.equal(isValidRoleKey('manager'), true);
});

test('isValidRoleKey rejects invalid keys', () => {
  assert.equal(isValidRoleKey(''), false);
  assert.equal(isValidRoleKey('123role'), false);
  assert.equal(isValidRoleKey('super admin'), false);
});

test('isValidRoleKey normalizes case before validation', () => {
  assert.equal(isValidRoleKey('Super_Admin'), true);
});

test('isValidPermissionKey accepts module.action format', () => {
  assert.equal(isValidPermissionKey('modules.view'), true);
  assert.equal(isValidPermissionKey('auth.me'), true);
});

test('isValidPermissionKey rejects invalid keys', () => {
  assert.equal(isValidPermissionKey('modules'), false);
  assert.equal(isValidPermissionKey('modules.view.extra'), false);
});

test('isValidPermissionKey normalizes case before validation', () => {
  assert.equal(isValidPermissionKey('Modules.view'), true);
});

test('moduleKeyFromPermissionKey returns module segment', () => {
  assert.equal(moduleKeyFromPermissionKey('projects.manage'), 'projects');
  assert.equal(moduleKeyFromPermissionKey('auth.me'), 'auth');
});
