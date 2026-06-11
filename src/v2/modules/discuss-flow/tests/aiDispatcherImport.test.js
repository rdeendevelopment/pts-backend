const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('DISCUSS_IMPORT_CHAT dispatch contract', () => {
  it('uses forceAsync inside input and discuss-flow source module', () => {
    const dispatchPayload = {
      action: 'DISCUSS_IMPORT_CHAT',
      actor: 'account-1',
      tenantId: 'account-1',
      sourceModule: 'discuss-flow',
      sourceId: 'topic-1',
      context: {
        topicId: 'topic-1',
        importBatchId: 'batch-1',
      },
      input: {
        source_type: 'manual_paste',
        parse_mode: 'ai_raw',
        raw_text: 'chat',
        rawText: 'chat',
        parsed_messages: [],
        parsedMessages: [],
        forceAsync: true,
      },
    };

    assert.equal(dispatchPayload.action, 'DISCUSS_IMPORT_CHAT');
    assert.equal(dispatchPayload.input.forceAsync, true);
    assert.equal(dispatchPayload.sourceModule, 'discuss-flow');
  });
});
