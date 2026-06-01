const { assertObjectId } = require('../../../kernel/validators/objectId');
const { canManageTasks } = require('./taskAccessScope.helper');

const DEFAULT_NOTIFICATION_LIMIT = 50;
const MAX_NOTIFICATION_LIMIT = 100;

function parseNotificationListQuery(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const rawLimit = Number(query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_NOTIFICATION_LIMIT)
    : DEFAULT_NOTIFICATION_LIMIT;

  const unreadOnly = query.unread === 'true'
    || query.unread === '1'
    || query.isRead === 'false';

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    unreadOnly,
  };
}

async function resolveNotificationUserId(req, findUserIdFromAuth) {
  const isManager = canManageTasks(req);
  const requestedUserId = req.query?.userId;

  if (isManager && requestedUserId) {
    return assertObjectId(requestedUserId, 'userId');
  }

  const userId = await findUserIdFromAuth(req.v2Auth.accountId);
  if (!userId && isManager) {
    return null;
  }
  if (!userId) {
    const { AppError } = require('../../../kernel/errors');
    const taskErrorCodes = require('../errors/taskErrorCodes');
    throw new AppError('User profile not found for account', {
      status: 404,
      code: taskErrorCodes.TASK_USER_NOT_FOUND,
    });
  }

  return userId;
}

function canViewMentionTask(task, userId, accessibleProjectIds = [], isManager = false) {
  if (!task) return false;
  if (isManager) return true;

  const uid = String(userId);
  const projectId = String(task.projectId);

  if (accessibleProjectIds.some((id) => String(id) === projectId)) {
    return true;
  }

  if ((task.assignees || []).some((row) => String(row.userId) === uid)) {
    return true;
  }

  if (task.reviewerId && String(task.reviewerId) === uid) {
    return true;
  }

  return false;
}

module.exports = {
  DEFAULT_NOTIFICATION_LIMIT,
  MAX_NOTIFICATION_LIMIT,
  parseNotificationListQuery,
  resolveNotificationUserId,
  canViewMentionTask,
};
