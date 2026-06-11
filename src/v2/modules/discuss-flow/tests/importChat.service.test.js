const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hashRawText,
  mapParsedMessages,
  resolveImportContent,
} = require('../services/importChat.service');

describe('importChat.service helpers', () => {
  it('hashes raw text deterministically', () => {
    const first = hashRawText('chat body');
    const second = hashRawText('chat body');
    assert.equal(first, second);
    assert.notEqual(first, 'chat body');
  });

  it('maps parsed messages with imported_whatsapp source', () => {
    const topic = { _id: 'topic-1', tenantId: 'tenant-1' };
    const batch = { _id: 'batch-1' };
    const parsed = {
      messages: [
        {
          ref: 'line-1',
          senderName: 'Cristian',
          content: 'Hello',
          originalTimestamp: '06/06/2026, 5:01 PM',
          createdAt: new Date('2026-06-06T17:01:00.000Z'),
        },
      ],
    };

    const rows = mapParsedMessages(topic, batch, parsed, 'whatsapp');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'imported_whatsapp');
    assert.equal(rows[0].authorType, 'imported');
    assert.equal(rows[0].authorName, 'Cristian');
    assert.equal(rows[0].importBatchId, 'batch-1');
    assert.equal(rows[0].clientMessageId, 'line-1');
    assert.equal(rows[0].metadata.originalTimestamp, '06/06/2026, 5:01 PM');
  });

  it('never fails import content resolution for unstructured text', () => {
    const raw = 'Plain notes without speaker labels\nSecond line of discussion';

    const resolved = resolveImportContent(raw, 'manual_paste');
    assert.ok(resolved.messages.length > 0);
    assert.ok(['structured', 'fallback', 'ai_raw'].includes(resolved.parseMode));
  });

  it('wraps unparseable content as a raw import blob for AI', () => {
    const resolved = resolveImportContent('   \n\n   ', 'whatsapp');
    assert.equal(resolved.messages.length, 1);
    assert.equal(resolved.parseMode, 'ai_raw');
    assert.equal(resolved.messages[0].ref, 'import-raw');
  });
});
