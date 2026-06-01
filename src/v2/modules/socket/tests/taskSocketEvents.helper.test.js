const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskMoved,
  emitTaskCompleted,
  emitTaskArchived,
  emitTaskRestored,
  emitTaskCommentCreated,
} = require('../../tasks/helpers/taskSocketEvents.helper');
const { SERVER_EVENTS } = require('../constants/socket.constants');

const PROJECT_ID = '507f1f77bcf86cd799439013';
const TASK_ID = '507f1f77bcf86cd799439014';
const TASK = { id: TASK_ID, projectId: PROJECT_ID, title: 'Test' };
const COMMENT = { id: '507f1f77bcf86cd799439016', content: 'Hello' };

test('task socket event helpers are callable when socket is not ready', () => {
  assert.doesNotThrow(() => emitTaskCreated(PROJECT_ID, TASK));
  assert.doesNotThrow(() => emitTaskUpdated(PROJECT_ID, TASK));
  assert.doesNotThrow(() => emitTaskMoved(PROJECT_ID, TASK, { toStatusId: 'x' }));
  assert.doesNotThrow(() => emitTaskCompleted(PROJECT_ID, TASK));
  assert.doesNotThrow(() => emitTaskArchived(PROJECT_ID, TASK));
  assert.doesNotThrow(() => emitTaskRestored(PROJECT_ID, TASK));
  assert.doesNotThrow(() => emitTaskCommentCreated(PROJECT_ID, TASK_ID, COMMENT));
});

test('task lifecycle events map to SERVER_EVENTS constants', () => {
  assert.equal(SERVER_EVENTS.TASK_CREATED, 'task.created');
  assert.equal(SERVER_EVENTS.TASK_UPDATED, 'task.updated');
  assert.equal(SERVER_EVENTS.TASK_MOVED, 'task.moved');
  assert.equal(SERVER_EVENTS.TASK_COMPLETED, 'task.completed');
  assert.equal(SERVER_EVENTS.TASK_ARCHIVED, 'task.archived');
  assert.equal(SERVER_EVENTS.TASK_RESTORED, 'task.restored');
  assert.equal(SERVER_EVENTS.TASK_COMMENT_CREATED, 'task.comment.created');
});
