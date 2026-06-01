const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getAccountRoom,
  getUserRoom,
  getProjectRoom,
  getTaskRoom,
  getConversationRoom,
  assertKnownRoom,
} = require('../helpers/socketRooms.helper');
const socketErrorCodes = require('../errors/socketErrorCodes');

const SAMPLE_ACCOUNT_ID = '507f1f77bcf86cd799439011';
const SAMPLE_USER_ID = '507f1f77bcf86cd799439012';
const SAMPLE_PROJECT_ID = '507f1f77bcf86cd799439013';
const SAMPLE_TASK_ID = '507f1f77bcf86cd799439014';
const SAMPLE_CONVERSATION_ID = '507f1f77bcf86cd799439015';

test('room helpers build stable prefixed room names', () => {
  assert.equal(getAccountRoom(SAMPLE_ACCOUNT_ID), `account:${SAMPLE_ACCOUNT_ID}`);
  assert.equal(getUserRoom(SAMPLE_USER_ID), `user:${SAMPLE_USER_ID}`);
  assert.equal(getProjectRoom(SAMPLE_PROJECT_ID), `project:${SAMPLE_PROJECT_ID}`);
  assert.equal(getTaskRoom(SAMPLE_TASK_ID), `task:${SAMPLE_TASK_ID}`);
  assert.equal(
    getConversationRoom(SAMPLE_CONVERSATION_ID),
    `conversation:${SAMPLE_CONVERSATION_ID}`
  );
});

test('assertKnownRoom accepts generated room names', () => {
  const room = getProjectRoom(SAMPLE_PROJECT_ID);
  assert.equal(assertKnownRoom(room), room);
});

test('assertKnownRoom rejects unknown prefixes', () => {
  assert.throws(
    () => assertKnownRoom('legacy:123'),
    (err) => err.code === socketErrorCodes.SOCKET_ROOM_INVALID
  );
});
