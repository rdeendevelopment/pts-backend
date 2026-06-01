const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SERVER_EVENTS, CLIENT_EVENTS } = require('../constants/socket.constants');

test('server event constants use dot notation', () => {
  for (const value of Object.values(SERVER_EVENTS)) {
    assert.match(value, /^[a-z0-9]+(?:\.[a-z0-9]+)+$/);
  }
});

test('client room events use dot notation', () => {
  for (const value of Object.values(CLIENT_EVENTS)) {
    assert.match(value, /^[a-z0-9]+(?:\.[a-z0-9.]+)+$/);
  }
});

test('task lifecycle events are defined', () => {
  assert.equal(SERVER_EVENTS.TASK_CREATED, 'task.created');
  assert.equal(SERVER_EVENTS.TASK_UPDATED, 'task.updated');
  assert.equal(SERVER_EVENTS.TASK_MOVED, 'task.moved');
  assert.equal(SERVER_EVENTS.TASK_COMPLETED, 'task.completed');
  assert.equal(SERVER_EVENTS.TASK_ARCHIVED, 'task.archived');
  assert.equal(SERVER_EVENTS.TASK_RESTORED, 'task.restored');
});

test('activity and converse event names are reserved', () => {
  assert.equal(SERVER_EVENTS.ACTIVITY_WEEK_REJECTED, 'activity.week.rejected');
  assert.equal(SERVER_EVENTS.ACTIVITY_ENTRY_CREATED, 'activity.entry.created');
  assert.equal(SERVER_EVENTS.CONVERSE_TYPING_STARTED, 'converse.typing.started');
});
