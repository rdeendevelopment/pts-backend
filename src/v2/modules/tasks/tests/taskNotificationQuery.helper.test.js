const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseNotificationListQuery,
  canViewMentionTask,
} = require('../helpers/taskNotificationQuery.helper');

test('parseNotificationListQuery applies defaults and unread filter', () => {
  const result = parseNotificationListQuery({ unread: 'true', page: '2', limit: '25' });
  assert.equal(result.page, 2);
  assert.equal(result.limit, 25);
  assert.equal(result.skip, 25);
  assert.equal(result.unreadOnly, true);
});

test('parseNotificationListQuery treats isRead=false as unread filter', () => {
  const result = parseNotificationListQuery({ isRead: 'false' });
  assert.equal(result.unreadOnly, true);
});

test('canViewMentionTask allows managers without assignment', () => {
  const allowed = canViewMentionTask(
    { projectId: '507f1f77bcf86cd799439011', assignees: [] },
    '507f1f77bcf86cd799439012',
    [],
    true
  );
  assert.equal(allowed, true);
});

test('canViewMentionTask allows assignee on accessible project', () => {
  const userId = '507f1f77bcf86cd799439012';
  const projectId = '507f1f77bcf86cd799439011';
  const allowed = canViewMentionTask(
    {
      projectId,
      assignees: [{ userId }],
      reviewerId: null,
    },
    userId,
    [projectId],
    false
  );
  assert.equal(allowed, true);
});

test('canViewMentionTask denies unrelated project access', () => {
  const allowed = canViewMentionTask(
    {
      projectId: '507f1f77bcf86cd799439011',
      assignees: [{ userId: '507f1f77bcf86cd799439099' }],
      reviewerId: null,
    },
    '507f1f77bcf86cd799439012',
    ['507f1f77bcf86cd799439088'],
    false
  );
  assert.equal(allowed, false);
});
