const test = require('node:test');
const assert = require('node:assert/strict');
const { authorFieldsFromMap, displayName } = require('../helpers/taskUser.helper');

test('authorFieldsFromMap returns authorName and authorEmail', () => {
  const map = {
    '507f1f77bcf86cd799439011': {
      firstName: 'Hamza',
      lastName: 'Babar',
      email: 'hamza@example.com',
    },
  };

  const fields = authorFieldsFromMap(map, '507f1f77bcf86cd799439011');
  assert.equal(fields.authorName, 'Hamza Babar');
  assert.equal(fields.authorEmail, 'hamza@example.com');
});

test('authorFieldsFromMap falls back to account email', () => {
  const map = {
    acc1: { email: 'user@example.com' },
  };
  const fields = authorFieldsFromMap(map, 'acc1');
  assert.equal(fields.authorName, 'user@example.com');
});

test('displayName prefers displayName field', () => {
  assert.equal(displayName({ displayName: 'PTS Admin' }), 'PTS Admin');
});
