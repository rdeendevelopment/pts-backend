const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const service = require('../services/converseNotification.service');
const notifications = require('../../tasks/services/taskNotification.service');
const sockets = require('../../socket/services/socket.service');
const users = require('../../users/repositories/user.repository');

const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439012';
const C = '507f1f77bcf86cd799439013';
const CONVERSATION = '507f1f77bcf86cd799439021';
const MESSAGE = '507f1f77bcf86cd799439031';
let originals;
let created;
let activeUsers;

function stub(object, key, replacement) {
  originals.push([object, key, object[key]]);
  object[key] = replacement;
}

function input(overrides = {}) {
  return {
    conversation: { _id: CONVERSATION, type: 'direct', title: '' },
    message: { _id: MESSAGE, text: 'Can you review the latest changes?', mentions: [] },
    actorUserId: A,
    actorName: 'Usama Ilyas',
    participants: [{ userId: A }, { userId: B }],
    ...overrides,
  };
}

beforeEach(() => {
  originals = [];
  created = [];
  activeUsers = new Set();
  stub(users, 'findById', async () => ({ _id: A, accountId: A, displayName: 'Usama Ilyas' }));
  stub(sockets, 'isUserInConversation', async (userId) => activeUsers.has(String(userId)));
  stub(notifications, 'createAndEmitNotification', async (payload) => {
    created.push(payload);
    return payload;
  });
});

afterEach(() => originals.reverse().forEach(([object, key, value]) => { object[key] = value; }));

test('direct message creates one recipient notification with a safe deep link and stable dedupe key', async () => {
  await service.notifyForMessage(input());
  assert.equal(created.length, 1);
  assert.equal(created[0].userId, B);
  assert.equal(created[0].type, 'converse_direct_message');
  assert.equal(created[0].title, 'Usama Ilyas sent you a message');
  assert.equal(created[0].link, `/converse/${CONVERSATION}?messageId=${MESSAGE}`);
  assert.equal(created[0].metadata.messageId, MESSAGE);
  assert.equal(created[0].dedupeKey, `converse:${MESSAGE}:${B}`);
});

test('own messages do not notify and an actively viewed direct conversation is suppressed', async () => {
  activeUsers.add(B);
  await service.notifyForMessage(input({ participants: [{ userId: A }, { userId: B }] }));
  assert.equal(created.length, 0);
});

test('group messages notify mentions only', async () => {
  await service.notifyForMessage(input({
    conversation: { _id: CONVERSATION, type: 'group', title: 'PTS - Bugs' },
    message: { _id: MESSAGE, text: '@Hassan can you verify this?', mentions: [B] },
    participants: [{ userId: A }, { userId: B }, { userId: C }],
  }));
  assert.deepEqual(created.map((row) => row.userId), [B]);
  assert.equal(created[0].type, 'converse_mentioned');
  assert.equal(created[0].category, 'mention');
});

test('reply notifies the original sender without notifying every room member', async () => {
  await service.notifyForMessage(input({
    conversation: { _id: CONVERSATION, type: 'project', title: 'PTS - Bugs' },
    message: { _id: MESSAGE, text: 'I have fixed that issue.', mentions: [], replyTo: { senderId: B } },
    participants: [{ userId: A }, { userId: B }, { userId: C }],
  }));
  assert.deepEqual(created.map((row) => row.userId), [B]);
  assert.equal(created[0].type, 'converse_replied');
});

test('notification preview strips code bodies and truncates long content', () => {
  const preview = service.safePreview(`Before\n\`\`\`js\nconst secret = true;\n\`\`\` ${'x'.repeat(180)}`);
  assert.match(preview, /^Before \[code\]/);
  assert.equal(preview.length, 120);
  assert(!preview.includes('secret'));
});
