const test = require('node:test');
const assert = require('node:assert/strict');
const { USER_STATUSES } = require('../constants/users.constants');
const { assertValidStatus } = require('../services/user.service');

test('assertValidStatus accepts known statuses', () => {
  for (const status of USER_STATUSES) {
    assert.doesNotThrow(() => assertValidStatus(status));
  }
});

test('assertValidStatus rejects unknown statuses', () => {
  assert.throws(() => assertValidStatus('terminated'), (err) => err.code === 'USER_INVALID_STATUS');
});
