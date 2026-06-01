const { AppError } = require('../../../kernel/errors');
const userRepository = require('../../users/repositories/user.repository');
const taskErrorCodes = require('../errors/taskErrorCodes');

function canManageTasks(req) {
  const permissions = req.v2Auth?.permissions || [];
  return permissions.includes('tasks.manage');
}

async function findUserIdFromAuth(accountId) {
  const user = await userRepository.findByAccountId(accountId);
  return user?._id || null;
}

async function resolveUserIdFromAuth(accountId) {
  const userId = await findUserIdFromAuth(accountId);
  if (!userId) {
    throw new AppError('User profile not found for account', {
      status: 404,
      code: taskErrorCodes.TASK_USER_NOT_FOUND,
    });
  }
  return userId;
}

module.exports = {
  canManageTasks,
  findUserIdFromAuth,
  resolveUserIdFromAuth,
};
