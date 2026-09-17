const test = require('node:test');
const assert = require('node:assert/strict');

const userService = require('../services/user.service');
const controller = require('../controllers/user.controller');

test('presence controllers resolve a user profile from authenticated accountId', async () => {
  const original = userService.ensureUserProfileForAccount;
  let receivedAccountId = null;
  userService.ensureUserProfileForAccount = async (accountId) => {
    receivedAccountId = accountId;
    return { _id: '507f1f77bcf86cd799439012' };
  };
  try {
    const userId = await controller.resolveCurrentUserId({ v2Auth: { accountId: '507f1f77bcf86cd799439011' } });
    assert.equal(receivedAccountId, '507f1f77bcf86cd799439011');
    assert.equal(userId, '507f1f77bcf86cd799439012');
  } finally {
    userService.ensureUserProfileForAccount = original;
  }
});
