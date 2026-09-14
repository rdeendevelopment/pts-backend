const { assertObjectId } = require('../../../kernel/validators/objectId');
const { canViewAllTaskProjects } = require('./taskAccessScope.helper');

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

  const readState = ['all', 'read', 'unread'].includes(query.readState) ? query.readState : 'all';
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    unreadOnly,
    readState,
    category: query.category || null,
    module: query.module || null,
    projectId: query.projectId || null,
    search: String(query.search || '').trim().slice(0, 120),
    dateFrom: query.dateFrom || null,
    dateTo: query.dateTo || null,
  };
}

async function resolveNotificationUserId(req, findUserIdFromAuth) {
  const isManager = canViewAllTaskProjects(req);
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

function canViewMentionTask(task, userId, accessibleProjectIds = [], isManager = false, collaboratorTaskIds = []) {
  if (!task) return false;
  if (isManager) return true;
  const projectId = String(task.projectId);
  return accessibleProjectIds.some((id) => String(id) === projectId);
}

module.exports = {
  DEFAULT_NOTIFICATION_LIMIT,
  MAX_NOTIFICATION_LIMIT,
  parseNotificationListQuery,
  resolveNotificationUserId,
  canViewMentionTask,
};
