const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../../../config/env');
const notificationService = require('../services/taskNotification.service');
const collaboratorRepository = require('../repositories/taskCollaborator.repository');
const userRepository = require('../../users/repositories/user.repository');
const policy = require('../services/taskNotificationPolicy.service');

const TASK_ID = '507f1f77bcf86cd799439011';
const PROJECT_ID = '507f1f77bcf86cd799439012';
const USER_ID = '507f1f77bcf86cd799439013';

async function capture(run, userLookup = async () => null) {
  const originals = {
    expanded: env.v2.taskFeatures.expandedNotifications,
    create: notificationService.createAndEmitNotification,
    collaborators: collaboratorRepository.listActiveByTaskId,
    actor: userRepository.findByAccountId,
  };
  const rows = [];
  env.v2.taskFeatures.expandedNotifications = true;
  notificationService.createAndEmitNotification = async (payload) => { rows.push(payload); return payload; };
  collaboratorRepository.listActiveByTaskId = async () => [];
  userRepository.findByAccountId = userLookup;
  try { await run(); return rows; } finally {
    env.v2.taskFeatures.expandedNotifications = originals.expanded;
    notificationService.createAndEmitNotification = originals.create;
    collaboratorRepository.listActiveByTaskId = originals.collaborators;
    userRepository.findByAccountId = originals.actor;
  }
}

test('same-column reorder does not generate a status notification', async () => {
  const rows = await capture(() => policy.workflowMoved({
    before: { workflowStatusId: '507f1f77bcf86cd799439020' },
    after: { _id: TASK_ID, projectId: PROJECT_ID, workflowStatusId: '507f1f77bcf86cd799439020', primaryAssigneeId: USER_ID },
    targetStatus: { name: 'In progress' }, actorId: null,
  }));
  assert.equal(rows.length, 0);
});

test('blocked and review transitions are high-priority single workflow events', async () => {
  for (const name of ['Blocked', 'Review']) {
    const rows = await capture(() => policy.workflowMoved({
      before: { workflowStatusId: '507f1f77bcf86cd799439020', workflowStatusName: 'In progress' },
      after: { _id: TASK_ID, projectId: PROJECT_ID, workflowStatusId: '507f1f77bcf86cd799439021', primaryAssigneeId: USER_ID },
      targetStatus: { name }, actorId: null,
    }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priority, 'high');
  }
});

test('due-date change records old/new values and stable value-based dedupe', async () => {
  const rows = await capture(() => policy.taskUpdated({
    before: { _id: TASK_ID, projectId: PROJECT_ID, primaryAssigneeId: USER_ID, dueDate: null },
    after: { _id: TASK_ID, projectId: PROJECT_ID, primaryAssigneeId: USER_ID, dueDate: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z' },
    actorId: null, fields: ['dueDate'],
  }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata.oldDueDate, null);
  assert.equal(rows[0].metadata.newDueDate, '2026-09-12T00:00:00.000Z');
  assert.match(rows[0].dedupeKey, /due:none:2026-09-12T00:00:00.000Z/);
});

test('mention recipient exclusion prevents a duplicate reply notification', async () => {
  const original = userRepository.findByAccountId;
  userRepository.findByAccountId = async () => ({ _id: USER_ID });
  try {
    const rows = await policy.commentReply(
      { _id: TASK_ID, projectId: PROJECT_ID }, null,
      { _id: '507f1f77bcf86cd799439097', authorId: '507f1f77bcf86cd799439099' },
      { _id: '507f1f77bcf86cd799439098' }, [USER_ID]
    );
    assert.deepEqual(rows, []);
  } finally { userRepository.findByAccountId = original; }
});

test('a direct reply targets the parent author with reply-specific dedupe', async () => {
  const rows = await capture(() => policy.commentReply(
      { _id: TASK_ID, projectId: PROJECT_ID, title: 'Notification module' },
      'reply-author',
      { _id: '507f1f77bcf86cd799439097', authorId: 'parent-account' },
      { _id: '507f1f77bcf86cd799439098' },
    ), async (accountId) => accountId === 'parent-account' ? { _id: USER_ID } : null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, USER_ID);
  assert.equal(rows[0].type, 'task_comment_replied');
  assert.match(rows[0].dedupeKey, /507f1f77bcf86cd799439098/);
});
