const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const service = require('../services/converse.service');
const conversations = require('../repositories/conversation.repository');
const participants = require('../repositories/participant.repository');
const messages = require('../repositories/message.repository');
const users = require('../../users/repositories/user.repository');
const accounts = require('../../auth/repositories/account.repository');
const rbac = require('../../rbac/services/rbacAccess.service');

const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439012';
const C = '507f1f77bcf86cd799439013';

let originals;
let store;

function stub(object, key, replacement) {
  originals.push([object, key, object[key]]);
  object[key] = replacement;
}

beforeEach(() => {
  originals = [];
  store = {
    conversations: new Map(),
    participants: new Map(),
    messages: [],
    nextConvId: 100,
    nextMsgId: 1,
  };

  const userRows = new Map([A, B, C].map((id, index) => [id, {
    _id: id, accountId: id, status: 'active', displayName: `User ${index + 1}`, email: `user${index + 1}@test`,
  }]));

  stub(users, 'findById', async (id) => userRows.get(String(id)) || null);
  stub(accounts, 'findById', async (id) => ({ _id: id, accountType: 'employee', status: 'active' }));
  stub(rbac, 'getSessionAccessForAccount', async () => ({ roles: [] }));

  stub(conversations, 'findById', async (id) => store.conversations.get(String(id)) || null);
  stub(conversations, 'findDirectByKey', async (key) => [...store.conversations.values()].find((row) => row.directKey === key) || null);
  stub(conversations, 'createConversation', async (data) => {
    if (data.directKey && [...store.conversations.values()].some((row) => row.directKey === data.directKey)) {
      const error = new Error('duplicate direct'); error.code = 11000; throw error;
    }
    const id = store.nextConvId++;
    const base = '507f1f77bcf86cd799439';
    const _id = base + String(id).padStart(24 - base.length, '0');
    const row = { _id, ...data, isDeleted: false, createdAt: new Date(), updatedAt: new Date() };
    store.conversations.set(_id, row);
    return row;
  });

  stub(participants, 'findActiveMembership', async (id, userId) => {
    const key = `${id}:${userId}`;
    const row = store.participants.get(key);
    return row && !row.leftAt ? row : null;
  });

  stub(participants, 'ensureParticipant', async (id, userId) => {
    const key = `${id}:${userId}`;
    const row = store.participants.get(key) || {
      conversationId: String(id),
      userId: String(userId),
      role: 'member',
      unreadCount: 0,
      lastReadSequence: 0,
    };
    row.leftAt = null;
    store.participants.set(key, row);
    return row;
  });

  stub(participants, 'listActiveByUserId', async (userId) => [...store.participants.values()]
    .filter((row) => row.userId === String(userId) && !row.leftAt));

  stub(participants, 'listActiveByConversationId', async (id) => [...store.participants.values()]
    .filter((row) => row.conversationId === String(id) && !row.leftAt));

  stub(participants, 'incrementUnreadForOthers', async (id, senderId, allowedIds) => {
    [...store.participants.values()].filter((row) => row.conversationId === String(id) && row.userId !== String(senderId) && !row.leftAt && allowedIds.map(String).includes(row.userId))
      .forEach((row) => { row.unreadCount += 1; });
  });

  stub(participants, 'incrementMentions', async (id, mentionTargets) => {
    // Just a no-op stub for test purposes
  });

  stub(conversations, 'updateConversation', async (id, updates) => {
    const row = store.conversations.get(String(id));
    if (row) Object.assign(row, updates);
    return row;
  });

  stub(messages, 'nextSequence', async (conversationId) => {
    const convo = store.conversations.get(String(conversationId));
    convo.messageSequence = (convo.messageSequence || 0) + 1;
    return convo.messageSequence;
  });

  stub(messages, 'createMessage', async (data) => {
    const id = store.nextMsgId++;
    const base = '507f1f77bcf86cd799440';
    const _id = base + String(id).padStart(24 - base.length, '0');
    const msg = {
      ...data,
      _id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.messages.push(msg);
    return msg;
  });

  stub(messages, 'findById', async (messageId) => store.messages.find((m) => m._id === messageId) || null);

  stub(messages, 'listByConversation', async (conversationId, userId, { beforeCursor = null, limit = 40 } = {}) => {
    const filter = (msg) => {
      if (msg.conversationId !== conversationId) return false;
      if (msg.isDeletedForEveryone) return false;
      if (msg.deletedForUsers?.includes(userId)) return false;
      if (beforeCursor) {
        return msg.sequence < beforeCursor.sequence ||
          (msg.sequence === beforeCursor.sequence && String(msg._id) < beforeCursor.messageId);
      }
      return true;
    };

    const items = store.messages.filter(filter).sort((a, b) => {
      if (b.sequence !== a.sequence) return b.sequence - a.sequence;
      return String(b._id).localeCompare(String(a._id));
    });

    const hasMore = items.length > limit;
    const sliced = items.slice(0, limit);
    const last = sliced[sliced.length - 1];
    const nextCursor = hasMore ? `${last.sequence}:${last._id}` : null;

    return { items: sliced, hasMore, nextCursor };
  });

  stub(messages, 'findByClientMessageId', async (conversationId, senderId, clientMessageId) => {
    if (!clientMessageId) return null;
    return store.messages.find((m) => m.conversationId === conversationId && m.senderId === senderId && m.clientMessageId === clientMessageId) || null;
  });

  stub(messages, 'updateMessage', async (messageId, updates) => {
    const msg = store.messages.find((m) => m._id === messageId);
    if (msg) Object.assign(msg, updates);
    return msg;
  });
});

afterEach(() => {
  originals.forEach(([object, key, value]) => {
    object[key] = value;
  });
  originals = [];
});

test('HTTP 400 should not occur on first load with valid conversationId', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  const result = await service.listMessages(conv.conversation._id, B, { limit: 40 });
  assert(result !== null);
  assert.equal(result.data.length, 0);
  assert.equal(result.meta.hasNextPage, false);
  assert.equal(result.meta.nextCursor, null);
});

test('first conversation load returns empty array for new conversation', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  const result = await service.listMessages(conv.conversation._id, A, {});
  assert(Array.isArray(result.data));
  assert.equal(result.data.length, 0);
  assert.equal(result.meta.hasNextPage, false);
});

test('load empty conversation with limit parameter', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  const result = await service.listMessages(conv.conversation._id, A, { limit: 40 });
  assert.equal(result.data.length, 0);
  assert.equal(result.meta.hasNextPage, false);
  assert.equal(result.meta.nextCursor, null);
});

test('conversation with history paginates correctly without 400', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  for (let i = 0; i < 5; i++) {
    await service.sendMessage(A, 'User 1', conv.conversation._id, { text: `msg ${i}` });
  }

  const first = await service.listMessages(conv.conversation._id, B, { limit: 2 });
  assert.equal(first.data.length, 2);
  assert.equal(first.meta.hasNextPage, true);
  assert(first.meta.nextCursor);

  // Verify cursor format: should be sequence:messageId
  const cursorMatch = String(first.meta.nextCursor).match(/^([1-9]\d*):([a-f\d]{24})$/i);
  assert(cursorMatch, `Cursor format invalid: ${first.meta.nextCursor}`);
  assert.equal(cursorMatch[1], String(first.data[1].sequence));
  assert.equal(cursorMatch[2], first.data[1]._id);
});

test('pagination with cursor does not return HTTP 400', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  for (let i = 0; i < 5; i++) {
    await service.sendMessage(A, 'User 1', conv.conversation._id, { text: `msg ${i}` });
  }

  const first = await service.listMessages(conv.conversation._id, B, { limit: 2 });
  const cursor = first.meta.nextCursor;
  assert(cursor);

  // This should NOT throw HTTP 400
  const second = await service.listMessages(conv.conversation._id, B, { limit: 2, before: cursor });
  assert(second !== null);
  assert(Array.isArray(second.data));
  assert.equal(second.data.length, 2);
});

test('refresh/reload of same conversation works', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  for (let i = 0; i < 3; i++) {
    await service.sendMessage(A, 'User 1', conv.conversation._id, { text: `msg ${i}` });
  }

  const first = await service.listMessages(conv.conversation._id, B, { limit: 40 });
  assert.equal(first.data.length, 3);

  // Reload same conversation
  const reload = await service.listMessages(conv.conversation._id, B, { limit: 40 });
  assert.equal(reload.data.length, 3);
  assert.deepEqual(reload.data.map((m) => m._id), first.data.map((m) => m._id));
});

test('invalid cursor returns 400 as expected', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  await assert.rejects(
    service.listMessages(conv.conversation._id, B, { before: 'invalid-cursor-format' }),
    (error) => error.status === 400
  );
});

test('invalid message ID in cursor returns 400', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  await assert.rejects(
    service.listMessages(conv.conversation._id, B, { before: '1:not-a-valid-id' }),
    (error) => error.status === 400
  );
});

test('sequence 0 in cursor returns 400', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  await assert.rejects(
    service.listMessages(conv.conversation._id, B, { before: '0:507f1f77bcf86cd799439011' }),
    (error) => error.status === 400
  );
});

test('empty query object does not include cursor', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  for (let i = 0; i < 3; i++) {
    await service.sendMessage(A, 'User 1', conv.conversation._id, { text: `msg ${i}` });
  }
  const result = await service.listMessages(conv.conversation._id, B, {});
  assert.equal(result.data.length, 3);
});

test('query without before key does not trigger validation', async () => {
  const conv = await service.createDirect(A, 'User 1', B);
  for (let i = 0; i < 3; i++) {
    await service.sendMessage(A, 'User 1', conv.conversation._id, { text: `msg ${i}` });
  }
  const result = await service.listMessages(conv.conversation._id, B, { limit: 40 });
  assert.equal(result.data.length, 3);
});
