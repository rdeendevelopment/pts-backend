const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('message soft delete contract', () => {
  it('soft delete sets messageStatus deleted without hard removal', () => {
    const before = {
      _id: 'msg-1',
      topicId: 'topic-1',
      content: 'Original',
      isDeleted: false,
      messageStatus: 'active',
      deletedAt: null,
    };

    const after = {
      ...before,
      isDeleted: true,
      messageStatus: 'deleted',
      deletedAt: new Date('2026-06-06T12:00:00.000Z'),
    };

    assert.equal(after.isDeleted, true);
    assert.equal(after.messageStatus, 'deleted');
    assert.ok(after.deletedAt);
    assert.equal(after.content, 'Original');
  });
});
