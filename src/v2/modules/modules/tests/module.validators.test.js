const test = require('node:test');
const assert = require('node:assert/strict');
const { KEY_PATTERN } = require('../constants/module.constants');

test('KEY_PATTERN accepts lowercase snake_case keys', () => {
  assert.equal(KEY_PATTERN.test('projects'), true);
  assert.equal(KEY_PATTERN.test('work_management'), true);
  assert.equal(KEY_PATTERN.test('rbac'), true);
});

test('KEY_PATTERN rejects invalid keys', () => {
  assert.equal(KEY_PATTERN.test('Projects'), false);
  assert.equal(KEY_PATTERN.test('123abc'), false);
  assert.equal(KEY_PATTERN.test('has space'), false);
});
