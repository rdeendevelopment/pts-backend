const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveTaskKeyPrefix,
  formatTaskDisplayId,
} = require('../helpers/taskKeyPrefix.helper');

test('deriveTaskKeyPrefix uses project code when set', () => {
  assert.equal(deriveTaskKeyPrefix('Elite High School', 'EHS'), 'EHS');
});

test('deriveTaskKeyPrefix builds initials from name', () => {
  assert.equal(deriveTaskKeyPrefix('Elite High School', null), 'EHS');
});

test('formatTaskDisplayId combines prefix and number', () => {
  assert.equal(formatTaskDisplayId('EHS', 12), 'EHS-12');
});
