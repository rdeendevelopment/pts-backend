const test = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../../../kernel/errors');
const userErrorCodes = require('../errors/userErrorCodes');

function assertNotSelfManager(userId, managerId) {
  if (userId && managerId && String(userId) === String(managerId)) {
    throw new AppError('A user cannot be their own manager', {
      status: 400,
      code: userErrorCodes.USER_SELF_MANAGER_NOT_ALLOWED,
    });
  }
}

test('self-manager assignment is rejected', () => {
  assert.throws(
    () => assertNotSelfManager('665f1c2d3e4f5a6b7c8d9e0f', '665f1c2d3e4f5a6b7c8d9e0f'),
    (err) => err.code === userErrorCodes.USER_SELF_MANAGER_NOT_ALLOWED
  );
});

test('different manager id is allowed', () => {
  assert.doesNotThrow(() => assertNotSelfManager(
    '665f1c2d3e4f5a6b7c8d9e0f',
    '665f1c2d3e4f5a6b7c8d9e0a'
  ));
});
