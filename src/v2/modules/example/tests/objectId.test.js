const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidObjectId, assertObjectId } = require('../../../kernel/validators/objectId');
const { AppError } = require('../../../kernel/errors');

test('isValidObjectId accepts valid ObjectId strings', () => {
  assert.equal(isValidObjectId('665f1a2b3c4d5e6f7a8b9c0d'), true);
});

test('isValidObjectId rejects invalid values', () => {
  assert.equal(isValidObjectId('123'), false);
  assert.equal(isValidObjectId('not-an-id'), false);
});

test('assertObjectId returns normalized id for valid values', () => {
  const id = '665f1a2b3c4d5e6f7a8b9c0d';
  assert.equal(assertObjectId(`  ${id}  `, 'projectId'), id);
});

test('assertObjectId throws AppError for invalid id', () => {
  assert.throws(() => assertObjectId('bad-id', 'projectId'), (err) => {
    assert.ok(err instanceof AppError);
    assert.equal(err.code, 'INVALID_ID');
    return true;
  });
});
