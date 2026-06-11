const { AppError } = require('../../../kernel/errors');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const userRepository = require('../../users/repositories/user.repository');

async function resolveUserIdForAccount(accountId) {
  const user = await userRepository.findByAccountId(accountId);
  if (!user) {
    throw new AppError('User profile not found for account', {
      status: 404,
      code: dailyFlowErrorCodes.DAILY_FLOW_USER_NOT_FOUND,
    });
  }
  return user._id;
}

async function resolveAccountIdForUserId(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', {
      status: 404,
      code: dailyFlowErrorCodes.DAILY_FLOW_USER_NOT_FOUND,
    });
  }
  return user.accountId;
}

module.exports = {
  resolveUserIdForAccount,
  resolveAccountIdForUserId,
};
