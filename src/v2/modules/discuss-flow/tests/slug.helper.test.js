const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toSlug } = require('../helpers/slug.helper');

describe('slug.helper', () => {
  it('slugifies titles', () => {
    assert.equal(toSlug('SSO Requirements'), 'sso-requirements');
    assert.equal(toSlug('  Hello   World! '), 'hello-world');
  });
});
