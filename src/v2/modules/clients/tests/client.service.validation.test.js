const test = require('node:test');
const assert = require('node:assert/strict');
const { CLIENT_STATUSES, CLIENT_TYPES } = require('../constants/clients.constants');
const { assertValidStatus, assertValidType } = require('../services/client.service');

test('assertValidStatus accepts known statuses', () => {
  for (const status of CLIENT_STATUSES) {
    assert.doesNotThrow(() => assertValidStatus(status));
  }
});

test('assertValidStatus rejects unknown statuses', () => {
  assert.throws(() => assertValidStatus('deleted'), (err) => err.code === 'CLIENT_INVALID_STATUS');
});

test('assertValidType accepts known types', () => {
  for (const type of CLIENT_TYPES) {
    assert.doesNotThrow(() => assertValidType(type));
  }
});

test('assertValidType rejects unknown types', () => {
  assert.throws(() => assertValidType('partner'), (err) => err.code === 'CLIENT_INVALID_TYPE');
});
