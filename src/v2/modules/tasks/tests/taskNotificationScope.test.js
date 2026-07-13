const test = require('node:test');
const assert = require('node:assert/strict');

const taskNotificationRepository = require('../repositories/taskNotification.repository');
const taskNotificationService = require('../services/taskNotification.service');
const userRepository = require('../../users/repositories/user.repository');

const USER_ID = '507f1f77bcf86cd799439011';
const ACCOUNT_ID = '507f1f77bcf86cd799439012';

function req(query = {}) {
  return {
    query,
    v2Auth: {
      accountId: ACCOUNT_ID,
      permissions: ['tasks.view'],
    },
  };
}

test('buildTaskOnlyNotificationQuery matches task entity rows and legacy taskId rows', () => {
  const query = taskNotificationRepository.buildTaskOnlyNotificationQuery({ userId: USER_ID });

  assert.equal(query.userId, USER_ID);
  assert.deepEqual(query.$or, [
    { entityType: 'task' },
    { taskId: { $exists: true, $ne: null } },
  ]);
});

test('task notification list and unread count request task-only repository scope', async () => {
  const originalFindUser = userRepository.findByAccountId;
  const originalList = taskNotificationRepository.listByUserId;
  const originalCount = taskNotificationRepository.countUnreadByUserId;
  const originalMentionCount = taskNotificationRepository.countUnreadMentionsByUserId;

  const calls = {};
  userRepository.findByAccountId = async () => ({ _id: USER_ID });
  taskNotificationRepository.listByUserId = async (_userId, options) => {
    calls.list = { userId: String(_userId), options };
    return { items: [], total: 0 };
  };
  taskNotificationRepository.countUnreadByUserId = async (_userId, options) => {
    calls.count = { userId: String(_userId), options };
    return 1;
  };
  taskNotificationRepository.countUnreadMentionsByUserId = async () => 0;

  try {
    await taskNotificationService.listNotifications(req(), { limit: 10 });
    await taskNotificationService.getUnreadCount(req());
  } finally {
    userRepository.findByAccountId = originalFindUser;
    taskNotificationRepository.listByUserId = originalList;
    taskNotificationRepository.countUnreadByUserId = originalCount;
    taskNotificationRepository.countUnreadMentionsByUserId = originalMentionCount;
  }

  assert.equal(calls.list.userId, USER_ID);
  assert.equal(calls.list.options.taskOnly, true);
  assert.equal(calls.count.userId, USER_ID);
  assert.equal(calls.count.options.taskOnly, true);
});

test('global notification list and unread count request all notification types', async () => {
  const originalFindUser = userRepository.findByAccountId;
  const originalList = taskNotificationRepository.listByUserId;
  const originalCount = taskNotificationRepository.countUnreadByUserId;

  const calls = {};
  userRepository.findByAccountId = async () => ({ _id: USER_ID });
  taskNotificationRepository.listByUserId = async (_userId, options) => {
    calls.list = { userId: String(_userId), options };
    return { items: [], total: 0 };
  };
  taskNotificationRepository.countUnreadByUserId = async (_userId, options) => {
    calls.count = { userId: String(_userId), options };
    return 2;
  };

  try {
    await taskNotificationService.listGlobalNotifications(req(), { limit: 10 });
    await taskNotificationService.getGlobalUnreadCount(req());
  } finally {
    userRepository.findByAccountId = originalFindUser;
    taskNotificationRepository.listByUserId = originalList;
    taskNotificationRepository.countUnreadByUserId = originalCount;
  }

  assert.equal(calls.list.userId, USER_ID);
  assert.equal(calls.list.options.taskOnly, false);
  assert.equal(calls.count.userId, USER_ID);
  assert.equal(calls.count.options.taskOnly, false);
});

test('task mark-read paths are task-only while global mark-read paths are all-types', async () => {
  const originalFindUser = userRepository.findByAccountId;
  const originalMarkOne = taskNotificationRepository.markReadById;
  const originalMarkAll = taskNotificationRepository.markAllReadByUserId;

  const calls = [];
  userRepository.findByAccountId = async () => ({ _id: USER_ID });
  taskNotificationRepository.markReadById = async (_id, _userId, options) => {
    calls.push({ fn: 'one', id: String(_id), userId: String(_userId), options });
    return { _id, userId: _userId, type: 'task_mentioned', isRead: true };
  };
  taskNotificationRepository.markAllReadByUserId = async (_userId, options) => {
    calls.push({ fn: 'all', userId: String(_userId), options });
    return { modifiedCount: 1 };
  };

  try {
    await taskNotificationService.markNotificationRead('507f1f77bcf86cd799439013', req());
    await taskNotificationService.markAllNotificationsRead(req());
    await taskNotificationService.markGlobalNotificationRead('507f1f77bcf86cd799439014', req());
    await taskNotificationService.markAllGlobalNotificationsRead(req());
  } finally {
    userRepository.findByAccountId = originalFindUser;
    taskNotificationRepository.markReadById = originalMarkOne;
    taskNotificationRepository.markAllReadByUserId = originalMarkAll;
  }

  assert.deepEqual(calls.map((call) => call.options.taskOnly), [true, true, false, false]);
});
