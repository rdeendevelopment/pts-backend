const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const presenceService = require('../services/presence.service');

const ACCOUNT_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';

beforeEach(() => {
  presenceService.resetPresence();
});

test('presence tracks account and user sockets', () => {
  presenceService.addConnection({ socketId: 'socket-a', accountId: ACCOUNT_ID, userId: USER_ID });

  assert.equal(presenceService.isAccountOnline(ACCOUNT_ID), true);
  assert.equal(presenceService.isUserOnline(USER_ID), true);
  assert.deepEqual(presenceService.getOnlineAccountIds(), [ACCOUNT_ID]);
  assert.deepEqual(presenceService.getOnlineUserIds(), [USER_ID]);
});

test('presence clears account when last socket disconnects', () => {
  presenceService.addConnection({ socketId: 'socket-a', accountId: ACCOUNT_ID, userId: USER_ID });
  presenceService.addConnection({ socketId: 'socket-b', accountId: ACCOUNT_ID, userId: USER_ID });

  presenceService.removeConnection('socket-a');
  assert.equal(presenceService.isAccountOnline(ACCOUNT_ID), true);
  assert.equal(presenceService.isUserOnline(USER_ID), true);

  presenceService.removeConnection('socket-b');
  assert.equal(presenceService.isAccountOnline(ACCOUNT_ID), false);
  assert.equal(presenceService.isUserOnline(USER_ID), false);
});

test('presence snapshot reports active socket totals', () => {
  presenceService.addConnection({ socketId: 'socket-a', accountId: ACCOUNT_ID, userId: USER_ID });

  const snapshot = presenceService.getPresenceSnapshot();
  assert.equal(snapshot.totals.activeSockets, 1);
  assert.equal(snapshot.totals.onlineAccounts, 1);
  assert.equal(snapshot.totals.onlineUsers, 1);
});
