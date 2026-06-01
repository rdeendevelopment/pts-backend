const test = require('node:test');
const assert = require('node:assert/strict');
const { toNotificationDto, toMentionDto } = require('../dto/task.dto');

test('toNotificationDto maps v2 notification to legacy-compatible shape', () => {
  const dto = toNotificationDto({
    _id: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439012',
    taskId: '507f1f77bcf86cd799439013',
    projectId: '507f1f77bcf86cd799439014',
    type: 'task_mentioned',
    title: 'Fix deploy',
    body: 'Alex mentioned you in "Fix deploy"',
    isRead: false,
    readAt: null,
    metadata: {
      taskTitle: 'Fix deploy',
      triggeredByName: 'Alex',
      sourceCommentId: '507f1f77bcf86cd799439015',
    },
    createdAt: '2026-05-21T10:00:00.000Z',
    updatedAt: '2026-05-21T10:00:00.000Z',
  });

  assert.equal(dto._id, '507f1f77bcf86cd799439011');
  assert.equal(dto.message, 'Alex mentioned you in "Fix deploy"');
  assert.equal(dto.taskTitle, 'Fix deploy');
  assert.equal(dto.triggeredByName, 'Alex');
  assert.equal(dto.sourceCommentId, '507f1f77bcf86cd799439015');
  assert.equal(dto.projectRef.sourceId, '507f1f77bcf86cd799439014');
  assert.equal(dto.isRead, false);
});

test('toMentionDto maps comment mention row for Angular UI', () => {
  const dto = toMentionDto({
    comment: {
      _id: '507f1f77bcf86cd799439011',
      taskId: '507f1f77bcf86cd799439012',
      projectId: '507f1f77bcf86cd799439013',
      authorId: '507f1f77bcf86cd799439014',
      content: '@you please review',
      createdAt: '2026-05-21T10:00:00.000Z',
    },
    task: {
      _id: '507f1f77bcf86cd799439012',
      title: 'Deploy fix',
      taskNumber: 42,
    },
    project: {
      _id: '507f1f77bcf86cd799439013',
      name: 'PTS Platform',
    },
    author: {
      firstName: 'Alex',
      lastName: 'Kim',
      email: 'alex@example.com',
    },
  });

  assert.equal(dto._id, '507f1f77bcf86cd799439011');
  assert.equal(dto.text, '@you please review');
  assert.equal(dto.authorName, 'Alex Kim');
  assert.equal(dto.taskTitle, 'Deploy fix');
  assert.equal(dto.taskNumber, 42);
  assert.equal(dto.projectSourceId, '507f1f77bcf86cd799439013');
  assert.equal(dto.projectName, 'PTS Platform');
});
