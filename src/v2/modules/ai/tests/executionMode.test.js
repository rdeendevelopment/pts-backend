const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveExecutionMode } = require('../services/ai-dispatcher.service');
const { EXECUTION_MODES } = require('../constants/execution.constants');

describe('resolveExecutionMode', () => {
  const baseConfig = { executionMode: EXECUTION_MODES.AUTO };

  it('uses sync for small token estimates', () => {
    assert.equal(resolveExecutionMode(baseConfig, 500), EXECUTION_MODES.SYNC);
  });

  it('uses stream for medium token estimates', () => {
    assert.equal(resolveExecutionMode(baseConfig, 5000), EXECUTION_MODES.STREAM);
  });

  it('uses async for large token estimates', () => {
    assert.equal(resolveExecutionMode(baseConfig, 15000), EXECUTION_MODES.ASYNC);
  });

  it('respects forced async input', () => {
    assert.equal(
      resolveExecutionMode(baseConfig, 100, { forceAsync: true }),
      EXECUTION_MODES.ASYNC
    );
  });

  it('respects explicit execution mode', () => {
    assert.equal(
      resolveExecutionMode({ executionMode: EXECUTION_MODES.SYNC }, 50000),
      EXECUTION_MODES.SYNC
    );
  });
});
