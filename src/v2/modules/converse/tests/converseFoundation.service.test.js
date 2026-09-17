const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const service = require('../services/converse.service');
const conversations = require('../repositories/conversation.repository');
const participants = require('../repositories/participant.repository');
const messages = require('../repositories/message.repository');
const users = require('../../users/repositories/user.repository');
const accounts = require('../../auth/repositories/account.repository');
const rbac = require('../../rbac/services/rbacAccess.service');
const projects = require('../../projects');
const roomAccess = require('../../socket/services/socketRoomAccess.service');
const converseNotifications = require('../services/converseNotification.service');

const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439012';
const C = '507f1f77bcf86cd799439013';
const P = '507f1f77bcf86cd799439040';
let originals;
let store;

function stub(object, key, replacement) {
  originals.push([object, key, object[key]]);
  object[key] = replacement;
}

function membershipKey(conversationId, userId) {
  return `${conversationId}:${userId}`;
}

beforeEach(() => {
  originals = [];
  store = {
    conversations: new Map(), participants: new Map(), messages: [],
    nextConversation: 32, assignments: new Set([A, B]),
  };
  stub(converseNotifications, 'notifyForMessage', async () => []);
  const userRows = new Map([A, B, C].map((id, index) => [id, {
    _id: id, accountId: id, status: 'active', displayName: `Member ${index + 1}`, email: `member${index + 1}@example.test`,
  }]));

  stub(users, 'findById', async (id) => userRows.get(String(id)) || null);
  stub(users, 'listUsersPage', async (_filters, { limit, skip }) => ({
    items: [...userRows.values()].slice(skip, skip + limit), total: userRows.size,
  }));
  stub(accounts, 'findById', async (id) => ({ _id: id, accountType: 'employee', status: 'active' }));
  stub(rbac, 'getSessionAccessForAccount', async () => ({ roles: [] }));
  stub(projects, 'getProjectForActivity', async (id) => {
    if (String(id) !== P) throw new Error('Project not found');
    return { _id: P, name: 'Project Room' };
  });
  stub(projects, 'getAssignmentForUser', async (id, userId) =>
    String(id) === P && store.assignments.has(String(userId)) ? { projectId: P, userId } : null);

  stub(conversations, 'findById', async (id) => store.conversations.get(String(id)) || null);
  stub(conversations, 'findDirectByKey', async (key) => [...store.conversations.values()].find((row) => row.directKey === key) || null);
  stub(conversations, 'findProjectById', async (id) => [...store.conversations.values()].find((row) => row.projectId === String(id)) || null);
  stub(conversations, 'createConversation', async (data) => {
    if (data.directKey && [...store.conversations.values()].some((row) => row.directKey === data.directKey)) {
      const error = new Error('duplicate direct'); error.code = 11000; throw error;
    }
    if (data.projectId && [...store.conversations.values()].some((row) => row.projectId === String(data.projectId))) {
      const error = new Error('duplicate room'); error.code = 11000; throw error;
    }
    const _id = `507f1f77bcf86cd7994390${store.nextConversation++}`;
    const row = { _id, ...data, projectId: data.projectId ? String(data.projectId) : null, isDeleted: false, createdAt: new Date(), updatedAt: new Date() };
    store.conversations.set(_id, row);
    return row;
  });
  stub(conversations, 'updateConversation', async (id, updates) => {
    const row = store.conversations.get(String(id));
    Object.assign(row, updates);
    return row;
  });

  stub(participants, 'findMembership', async (id, userId) => store.participants.get(membershipKey(id, userId)) || null);
  stub(participants, 'findActiveMembership', async (id, userId) => {
    const row = store.participants.get(membershipKey(id, userId));
    return row && !row.leftAt ? row : null;
  });
  stub(participants, 'ensureParticipant', async (id, userId, role = 'member') => {
    const key = membershipKey(id, userId);
    const row = store.participants.get(key) || { conversationId: String(id), userId: String(userId), role, unreadCount: 0, lastReadSequence: 0 };
    row.leftAt = null;
    store.participants.set(key, row);
    return row;
  });
  stub(participants, 'createParticipants', async (rows) => rows.map((row) => {
    const saved = { ...row, conversationId: String(row.conversationId), userId: String(row.userId), unreadCount: 0, lastReadSequence: 0, leftAt: null };
    store.participants.set(membershipKey(saved.conversationId, saved.userId), saved);
    return saved;
  }));
  stub(participants, 'listActiveByUserId', async (userId) => [...store.participants.values()].filter((row) => row.userId === String(userId) && !row.leftAt));
  stub(participants, 'listActiveByConversationId', async (id) => [...store.participants.values()].filter((row) => row.conversationId === String(id) && !row.leftAt));
  stub(participants, 'updateParticipant', async (id, userId, updates) => {
    const row = store.participants.get(membershipKey(id, userId));
    Object.assign(row, updates);
    return row;
  });
  stub(participants, 'incrementUnreadForOthers', async (id, senderId, allowedIds) => {
    [...store.participants.values()].filter((row) => row.conversationId === String(id) && row.userId !== String(senderId) && !row.leftAt && allowedIds.map(String).includes(row.userId))
      .forEach((row) => { row.unreadCount += 1; });
  });
  stub(participants, 'incrementMentions', async (id, userIds) => {
    [...store.participants.values()].filter((row) => row.conversationId === String(id) && userIds.includes(row.userId))
      .forEach((row) => { row.mentionCount = Number(row.mentionCount || 0) + 1; });
  });

  stub(messages, 'nextSequence', async (id) => 1 + store.messages.filter((row) => row.conversationId === String(id)).length);
  stub(messages, 'createMessage', async (data) => {
    const row = { _id: `507f1f77bcf86cd7994391${String(store.messages.length + 1).padStart(2, '0')}`, ...data, conversationId: String(data.conversationId), senderId: String(data.senderId), createdAt: new Date(), updatedAt: new Date() };
    store.messages.push(row);
    return row;
  });
  stub(messages, 'findById', async (id) => store.messages.find((row) => row._id === String(id) && !row.isDeletedForEveryone) || null);
  stub(messages, 'findAnyById', async (id) => store.messages.find((row) => row._id === String(id)) || null);
  stub(messages, 'listByConversation', async (id, _userId, { beforeCursor, limit }) => {
    const rows = store.messages.filter((row) => row.conversationId === String(id) && (!beforeCursor || row.sequence < beforeCursor.sequence || (row.sequence === beforeCursor.sequence && row._id < String(beforeCursor.messageId)))).sort((a, b) => b.sequence - a.sequence || b._id.localeCompare(a._id));
    const items = rows.slice(0, limit);
    return { items, hasMore: rows.length > limit, nextCursor: rows.length > limit ? `${items[items.length - 1].sequence}:${items[items.length - 1]._id}` : null };
  });
  stub(messages, 'countUnreadAfter', async (id, userId, sequence) => store.messages.filter((row) => row.conversationId === String(id) && row.sequence > sequence && row.senderId !== String(userId)).length);
  stub(messages, 'pushReadReceipt', async () => undefined);
  stub(messages, 'updateMessage', async (id, updates) => {
    const row = store.messages.find((item) => item._id === String(id));
    Object.assign(row, updates);
    return row;
  });
  stub(messages, 'toggleReaction', async (id, userId, emoji) => {
    const row = store.messages.find((item) => item._id === String(id));
    row.reactions ||= [];
    let reaction = row.reactions.find((item) => item.emoji === emoji);
    if (!reaction) { reaction = { emoji, userIds: [] }; row.reactions.push(reaction); }
    reaction.userIds = reaction.userIds.includes(String(userId))
      ? reaction.userIds.filter((value) => value !== String(userId))
      : [...reaction.userIds, String(userId)];
    return row;
  });
});

afterEach(() => {
  originals.reverse().forEach(([object, key, original]) => { object[key] = original; });
});

test('direct conversations are canonical and reusable in either direction, including a create race', async () => {
  const [first, second] = await Promise.all([
    service.createDirect(A, 'Member 1', B),
    service.createDirect(B, 'Member 2', A),
  ]);
  assert.equal(first.conversation._id, second.conversation._id);
  assert.equal(store.conversations.size, 1);
  assert.equal(store.participants.size, 2);
  const reused = await service.createDirect(A, 'Member 1', B);
  assert.equal(reused.created, false);
  assert.equal(reused.conversation.directUser._id, B);
  const listed = await service.listConversations(B);
  assert.equal(listed[0].title, 'Member 1');
});

test('direct membership, sending, cursor history, unread and mark-read are enforced', async () => {
  const { conversation } = await service.createDirect(A, 'Member 1', B);
  await assert.rejects(service.getConversation(conversation._id, C), (error) => error.status === 403);
  await assert.rejects(service.sendMessage(C, 'Member 3', conversation._id, { text: 'forbidden' }), (error) => error.status === 403);
  for (let i = 1; i <= 3; i++) await service.sendMessage(A, 'Member 1', conversation._id, { text: `message ${i}` });
  const first = await service.listMessages(conversation._id, B, { limit: 2 });
  assert.deepEqual(first.data.map((row) => row.sequence), [3, 2]);
  assert.equal(first.meta.nextCursor, `2:${first.data[1]._id}`);
  const older = await service.listMessages(conversation._id, B, { limit: 2, before: first.meta.nextCursor });
  assert.deepEqual(older.data.map((row) => row.sequence), [1]);
  assert.equal(older.meta.hasNextPage, false);
  assert.equal((await service.getUnreadCount(B)).total, 3);
  const read = await service.markConversationRead(conversation._id, B, { messageId: first.data[0]._id });
  assert.equal(read.unreadCount, 0);
  assert.equal((await service.getUnreadCount(B)).total, 0);
  await assert.rejects(service.markConversationRead(conversation._id, B, { messageId: C }), (error) => error.status === 404);
});

test('message cursor keeps a stable order when legacy messages share a sequence', async () => {
  const { conversation } = await service.createDirect(A, 'Member 1', B);
  for (let i = 0; i < 4; i++) await service.sendMessage(A, 'Member 1', conversation._id, { text: `message ${i}` });
  store.messages[2].sequence = 2;

  const first = await service.listMessages(conversation._id, B, { limit: 2 });
  const second = await service.listMessages(conversation._id, B, { limit: 2, before: first.meta.nextCursor });
  assert.equal(first.meta.hasNextPage, true);
  assert.deepEqual([...first.data, ...second.data].map((row) => row._id),
    [store.messages[3], store.messages[2], store.messages[1], store.messages[0]].map((row) => row._id));
  assert.equal(new Set([...first.data, ...second.data].map((row) => row._id)).size, 4);
  await assert.rejects(service.listMessages(conversation._id, B, { before: '2:invalid' }), (error) => error.status === 400);
});

test('reply previews stay within the same authorized conversation', async () => {
  const first = await service.createDirect(A, 'Member 1', B);
  const second = await service.createDirect(A, 'Member 1', C);
  const original = await service.sendMessage(A, 'Member 1', first.conversation._id, { text: 'original' });
  const reply = await service.sendMessage(B, 'Member 2', first.conversation._id, { text: 'reply', replyToMessageId: original._id });
  assert.equal(String(reply.replyTo.messageId), original._id);
  assert.equal(reply.replyTo.text, 'original');
  await assert.rejects(service.sendMessage(A, 'Member 1', second.conversation._id,
    { text: 'cross-conversation reply', replyToMessageId: original._id }), (error) => error.status === 404);
});

test('reactions toggle for members and reject outsiders or cross-conversation IDs', async () => {
  const first = await service.createDirect(A, 'Member 1', B);
  const second = await service.createDirect(A, 'Member 1', C);
  const message = await service.sendMessage(A, 'Member 1', first.conversation._id, { text: 'Review this' });
  const added = await service.toggleReaction(first.conversation._id, message._id, B, '👍');
  assert.deepEqual(added.reactions[0].userIds, [B]);
  const removed = await service.toggleReaction(first.conversation._id, message._id, B, '👍');
  assert.deepEqual(removed.reactions[0].userIds, []);
  await assert.rejects(service.toggleReaction(first.conversation._id, message._id, C, '👍'), (error) => error.status === 403);
  await assert.rejects(service.toggleReaction(second.conversation._id, message._id, A, '👍'), (error) => error.status === 404);
  await assert.rejects(service.toggleReaction(first.conversation._id, message._id, B, '💣'), (error) => error.status === 422);
});

test('mentions are limited to members, and @all requires a group admin', async () => {
  const { conversation } = await service.createGroup(A, 'Review team', [B]);
  const sent = await service.sendMessage(A, 'Member 1', conversation._id,
    { text: 'Please review @Member_2', mentions: [B], mentionAll: false });
  assert.deepEqual(sent.mentions, [B]);
  assert.equal(store.participants.get(membershipKey(conversation._id, B)).mentionCount, 1);
  await assert.rejects(service.sendMessage(A, 'Member 1', conversation._id,
    { text: 'Not a member', mentions: [C] }), (error) => error.status === 403);
  await assert.rejects(service.sendMessage(B, 'Member 2', conversation._id,
    { text: '@all', mentionAll: true }), (error) => error.status === 403);
  const announcement = await service.sendMessage(A, 'Member 1', conversation._id,
    { text: '@all', mentionAll: true });
  assert.equal(announcement.mentionAll, true);
  assert.equal(store.participants.get(membershipKey(conversation._id, B)).mentionCount, 2);
});

test('groups validate members, deny outsiders and enforce admin membership changes', async () => {
  await assert.rejects(service.createGroup(A, 'Bad group', [C, '507f1f77bcf86cd799439099']), (error) => error.status === 404);
  const { conversation } = await service.createGroup(A, 'Team', [B]);
  await assert.rejects(service.listMessages(conversation._id, C), (error) => error.status === 403);
  await assert.rejects(service.addParticipants(conversation._id, B, [C]), (error) => error.status === 403);
  await service.addParticipants(conversation._id, A, [C]);
  const sent = await service.sendMessage(C, 'Member 3', conversation._id, { text: 'hello group' });
  assert.equal(sent.text, 'hello group');
  await service.removeParticipant(conversation._id, A, C);
  await assert.rejects(service.sendMessage(C, 'Member 3', conversation._id, { text: 'after removal' }), (error) => error.status === 403);
});

test('one project room is reused, assignment is required, and socket join uses the same access check', async () => {
  const first = await service.createProjectRoom(A, P);
  const second = await service.createProjectRoom(B, P);
  assert.equal(first.conversation._id, second.conversation._id);
  assert.equal(second.conversation.memberCount, 2);
  assert.equal(store.conversations.size, 1);
  const sent = await service.sendMessage(A, 'Member 1', first.conversation._id, { text: 'project update' });
  assert.equal((await service.listMessages(first.conversation._id, B)).data[0]._id, sent._id);
  assert.equal(await roomAccess.assertConversationRoomAccess(first.conversation._id, B), `conversation:${first.conversation._id}`);
  await assert.rejects(service.createProjectRoom(C, P), (error) => error.status === 403);
  await assert.rejects(roomAccess.assertConversationRoomAccess(first.conversation._id, C), (error) => error.status === 403);
  store.assignments.delete(B);
  await assert.rejects(service.listMessages(first.conversation._id, B), (error) => error.status === 403);
});

test('team member pages include people without conversations', async () => {
  const page = await service.listTeamMembers(A, { page: 1, limit: 2 });
  assert.deepEqual(page.items.map((row) => row._id), [B]);
  assert.equal(page.hasMore, true);
  const next = await service.listTeamMembers(A, { page: 2, limit: 2 });
  assert.deepEqual(next.items.map((row) => row._id), [C]);
});

test('multi-role Super Admin may access a project room without an assignment', async () => {
  rbac.getSessionAccessForAccount = async () => ({ roles: [{ key: 'employee' }, { key: 'super_admin' }] });
  const adminAuth = { account: { accountType: 'employee' }, sessionAccess: { roles: [{ key: 'employee' }, { key: 'super_admin' }] } };
  const { conversation } = await service.createProjectRoom(C, P, adminAuth);
  assert.equal(conversation.projectId, P);
  assert.equal((await service.getConversation(conversation._id, C, adminAuth))._id, conversation._id);
  await service.sendMessage(C, 'Admin', conversation._id, { text: 'admin update' }, adminAuth);
  assert.equal((await service.listMessages(conversation._id, C, {}, adminAuth)).data.length, 1);
});

test('message edit and delete reject another conversation or another sender', async () => {
  const one = (await service.createDirect(A, 'Member 1', B)).conversation;
  const two = (await service.createDirect(A, 'Member 1', C)).conversation;
  const message = await service.sendMessage(A, 'Member 1', one._id, { text: 'secret' });
  await assert.rejects(service.editMessage(two._id, message._id, A, 'changed'), (error) => error.status === 404);
  await assert.rejects(service.deleteMessageForEveryone(one._id, message._id, B), (error) => error.status === 403);
  const changed = await service.editMessage(one._id, message._id, A, 'changed');
  assert.equal(changed.text, 'changed');
  const deleted = await service.deleteMessageForEveryone(one._id, message._id, A);
  assert.equal(deleted.isDeletedForEveryone, true);
});
