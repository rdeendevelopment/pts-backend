const test = require('node:test');
const assert = require('node:assert/strict');

function normalizeLoginIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

test('normalizeLoginIdentifier lowercases and trims', () => {
  assert.equal(normalizeLoginIdentifier('  JohnDoe  '), 'johndoe');
  assert.equal(normalizeLoginIdentifier('Admin@PTS.COM'), 'admin@pts.com');
});
