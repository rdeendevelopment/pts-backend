const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeClientName,
  generateClientCode,
  normalizeTags,
} = require('../helpers/client.helper');

test('normalizeClientName lowercases and collapses whitespace', () => {
  assert.equal(normalizeClientName('  Acme   Corp  '), 'acme corp');
});

test('generateClientCode builds uppercase slug from name', () => {
  assert.equal(generateClientCode('Acme Corp'), 'ACME_CORP');
});

test('normalizeTags trims, lowercases, and deduplicates', () => {
  assert.deepEqual(
    normalizeTags([' Enterprise ', 'enterprise', 'SaaS', '']),
    ['enterprise', 'saas']
  );
});
