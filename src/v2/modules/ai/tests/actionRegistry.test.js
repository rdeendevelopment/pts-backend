const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { listActions, AI_ACTION_KEYS } = require('../services/ai-action-registry.service');
const { AI_ACTION_REGISTRY } = require('../constants/ai-actions.constants');

describe('ai-action-registry', () => {
  it('lists all configured actions', () => {
    const actions = listActions();
    assert.equal(actions.length, AI_ACTION_KEYS.length);
    assert.ok(actions.some((row) => row.action === 'DISCUSS_SUMMARIZE_TOPIC'));
  });

  it('has discuss summarize topic config', () => {
    const config = AI_ACTION_REGISTRY.DISCUSS_SUMMARIZE_TOPIC;
    assert.equal(config.model, 'gpt-4o-mini');
    assert.equal(config.maxSyncTokens, 4000);
    assert.equal(config.timeout, 15000);
  });
});
