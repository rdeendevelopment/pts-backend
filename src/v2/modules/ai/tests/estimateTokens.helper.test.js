const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  estimateTokensFromText,
  estimateTokensFromPayload,
} = require('../helpers/estimateTokens.helper');

describe('estimateTokens.helper', () => {
  it('estimates tokens from text', () => {
    assert.equal(estimateTokensFromText(''), 0);
    assert.equal(estimateTokensFromText('abcd'), 1);
    assert.equal(estimateTokensFromText('a'.repeat(100)), 25);
  });

  it('estimates tokens from payload parts', () => {
    const total = estimateTokensFromPayload({
      input: { title: 'Hello' },
      context: { module: 'tasks' },
    });
    assert.ok(total > 0);
  });
});
