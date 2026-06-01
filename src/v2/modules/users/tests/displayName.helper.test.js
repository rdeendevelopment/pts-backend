const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDisplayName } = require('../helpers/displayName.helper');

test('buildDisplayName uses explicit displayName when provided', () => {
  assert.equal(buildDisplayName('Ada', 'Lovelace', 'Admin Ada'), 'Admin Ada');
});

test('buildDisplayName combines first and last name', () => {
  assert.equal(buildDisplayName('Ada', 'Lovelace'), 'Ada Lovelace');
});

test('buildDisplayName handles missing last name', () => {
  assert.equal(buildDisplayName('Ada', ''), 'Ada');
});
