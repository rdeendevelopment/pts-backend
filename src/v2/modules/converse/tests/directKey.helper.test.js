const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeDirectKey } = require('../helpers/directKey.helper');

test('makeDirectKey is stable regardless of argument order', () => {
  const a = '507f1f77bcf86cd799439011';
  const b = '507f1f77bcf86cd799439012';
  assert.equal(makeDirectKey(a, b), makeDirectKey(b, a));
});

test('makeDirectKey uses sorted ObjectId strings', () => {
  const low = '507f1f77bcf86cd799439011';
  const high = '507f1f77bcf86cd799439012';
  assert.equal(makeDirectKey(low, high), `${low}:${high}`);
});
