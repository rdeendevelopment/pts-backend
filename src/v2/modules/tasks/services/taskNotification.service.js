const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { warn } = require('../../../kernel/logger');
const accountRepository = require('../../auth/repositories/account.repository');
const userRepository = require('../../users/repositories/user.repository');
const taskNotificationRepository = require('../repositories/taskNotification.repository');
const { findUserIdFromAuth } = require('../helpers/taskAccessScope.helper');
const {
  parseNotificationListQuery,
  resolveNotificationUserId,
} = require('../helpers/taskNotificationQuery.helper');
const { buildPaginationMeta } = require('../helpers/taskAggregateQuery.helper');
const { toNotificationDto } = require('../dto/task.dto');
const { emitNotificationCreated } = require('../../socket/helpers/notificationSocketEvents.helper');

function snippet(text, max = 160) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function optionalObjectId(value, fieldName) {
  if (value == null || value === '') return null;
  return assertObjectId(value, fieldName);
}

function notificationLink(payload = {}) {
  if (payload.link) return payload.link;
  if (payload.entityType === 'task' && payload.projectId && payload.taskId) {
    return `/tasks/project/${payload.projectId}?taskId=${payload.taskId}`;
  }
  if (payload.entityType === 'activity_week') {
    return '/admin/manage-activity/team-activity';
  }
  if (payload.entityType === 'project' && payload.projectId) {
    return `/projects/${payload.projectId}`;
  }
  return null;
}

function notificationModule(payload = {}) {
  if (payload.module) return payload.module;
  if (payload.entityType === 'activity_week' || payload.activityId) return 'activity';
  if (payload.entityType === 'task' || payload.taskId) return 'task';
  return null;
}

function emptyNotificationPage(query = {}) {
  const pagination = parseNotificationListQuery(query);
  return {
    items: [],
    pagination: buildPaginationMeta({ ...pagination, total: 0 }),
  };
}

function currentUserOnlyReq(req) {
  return {
    ...req,
    query: {
      ...(req.query || {}),
      userId: undefined,
    },
  };
}

async function listNotifications(req, query = {}) {
  const userId = await resolveNotificationUserId(req, findUserIdFromAuth);
  if (!userId) return emptyNotificationPage(query);

  const pagination = parseNotificationListQuery(query);
  const { items, total } = await taskNotificationRepository.listByUserId(userId, {
    unreadOnly: pagination.unreadOnly,
    skip: pagination.skip,
    limit: pagination.limit,
    taskOnly: true,
  });

  return {
    items: items.map(toNotificationDto),
    pagination: buildPaginationMeta({ ...pagination, total }),
  };
}

async function getUnreadCount(req) {
  const userId = await resolveNotificationUserId(req, findUserIdFromAuth);
  if (!userId) return { count: 0 };

  const count = await taskNotificationRepository.countUnreadByUserId(userId, { taskOnly: true });
  return { count };
}

async function markNotificationRead(notificationId, req, { taskOnly = true } = {}) {
  const userId = await resolveNotificationUserId(req, findUserIdFromAuth);
  if (!userId) {
    throw new AppError('Notification not found', { status: 404 });
  }
  const id = assertObjectId(notificationId, 'notificationId');
  const row = await taskNotificationRepository.markReadById(id, userId, { taskOnly });

  if (!row) {
    throw new AppError('Notification not found', { status: 404 });
  }

  return toNotificationDto(row);
}

async function markAllNotificationsRead(req, { taskOnly = true } = {}) {
  const userId = await resolveNotificationUserId(req, findUserIdFromAuth);
  if (userId) {
    await taskNotificationRepository.markAllReadByUserId(userId, { taskOnly });
  }
  return { success: true };
}

async function listGlobalNotifications(req, query = {}) {
  const userId = await resolveNotificationUserId(currentUserOnlyReq(req), findUserIdFromAuth);
  if (!userId) return emptyNotificationPage(query);

  const pagination = parseNotificationListQuery(query);
  const { items, total } = await taskNotificationRepository.listByUserId(userId, {
    unreadOnly: pagination.unreadOnly,
    skip: pagination.skip,
    limit: pagination.limit,
    taskOnly: false,
  });

  return {
    items: items.map(toNotificationDto),
    pagination: buildPaginationMeta({ ...pagination, total }),
  };
}

async function getGlobalUnreadCount(req) {
  const userId = await resolveNotificationUserId(currentUserOnlyReq(req), findUserIdFromAuth);
  if (!userId) return { count: 0 };

  const count = await taskNotificationRepository.countUnreadByUserId(userId, { taskOnly: false });
  return { count };
}

async function markGlobalNotificationRead(notificationId, req) {
  return markNotificationRead(notificationId, currentUserOnlyReq(req), { taskOnly: false });
}

async function markAllGlobalNotificationsRead(req) {
  return markAllNotificationsRead(currentUserOnlyReq(req), { taskOnly: false });
}

async function createAndEmitNotification(payload) {
  if (!payload?.userId || !payload?.type) return null;

  const actorUser = payload.actorId ? await userRepository.findByAccountId(payload.actorId) : null;
  if (actorUser && String(actorUser._id) === String(payload.userId)) {
    return null;
  }

  const notification = await taskNotificationRepository.createNotification({
    userId: assertObjectId(payload.userId, 'userId'),
    taskId: optionalObjectId(payload.taskId, 'taskId'),
    projectId: optionalObjectId(payload.projectId, 'projectId'),
    activityId: optionalObjectId(payload.activityId, 'activityId'),
    entityType: payload.entityType || null,
    entityId: payload.entityId ? String(payload.entityId) : null,
    actorId: optionalObjectId(payload.actorId, 'actorId'),
    actorName: payload.actorName || '',
    module: notificationModule(payload),
    priority: payload.priority || 'normal',
    type: payload.type,
    title: payload.title || 'Notification',
    body: payload.message || payload.body || '',
    isRead: false,
    link: notificationLink(payload),
    metadata: {
      ...(payload.metadata || {}),
      message: payload.message || payload.body || '',
      triggeredBy: payload.actorId || null,
      triggeredByName: payload.actorName || '',
      link: notificationLink(payload),
    },
  });

  const dto = toNotificationDto(notification);
  emitNotificationCreated({ userId: String(payload.userId), notification: dto });
  return dto;
}

async function listAdminUsers() {
  const accounts = [
    ...(await accountRepository.findAllByAccountType('admin')),
    ...(await accountRepository.findAllByAccountType('super_admin')),
  ];
  const users = await Promise.all(accounts.map((account) => userRepository.findByAccountId(account._id)));
  return users.filter(Boolean);
}

async function notifyAdmins(payload) {
  const admins = await listAdminUsers();
  const created = [];
  for (const admin of admins) {
    try {
      const row = await createAndEmitNotification({ ...payload, userId: admin._id });
      if (row) created.push(row);
    } catch (err) {
      warn('Failed to deliver admin notification', { type: payload?.type, message: err.message });
    }
  }
  return created;
}

async function notifyMention({
  recipientUserId,
  task,
  commentId,
  triggeredByAccountId,
  triggeredByName,
}) {
  if (!recipientUserId || !task?._id || !commentId) return null;

  const recipientId = assertObjectId(recipientUserId, 'recipientUserId');
  const actorUser = await userRepository.findByAccountId(triggeredByAccountId);
  if (actorUser && String(actorUser._id) === String(recipientId)) {
    return null;
  }

  const existing = await taskNotificationRepository.findMentionByComment(
    recipientId,
    task._id,
    commentId
  );
  if (existing) {
    return toNotificationDto(existing);
  }

  const taskTitle = task.title || 'Task';
  const notification = await taskNotificationRepository.createNotification({
    userId: recipientId,
    taskId: task._id,
    projectId: task.projectId,
    module: 'task',
    entityType: 'task',
    entityId: String(task._id),
    type: 'task_mentioned',
    title: taskTitle,
    body: `${triggeredByName || 'Someone'} mentioned you in "${snippet(taskTitle, 60)}"`,
    isRead: false,
    metadata: {
      taskTitle,
      triggeredBy: triggeredByAccountId,
      triggeredByName: triggeredByName || '',
      sourceCommentId: String(commentId),
    },
  });

  const dto = toNotificationDto(notification);
  emitNotificationCreated({ userId: String(recipientId), notification: dto });
  return dto;
}

async function resolveMentionRecipientUserId(rawId) {
  if (rawId == null || rawId === '') return null;

  try {
    return assertObjectId(rawId, 'mentionUserId');
  } catch (_) {
    const byEmail = await userRepository.findByEmail(String(rawId));
    if (byEmail?._id) return byEmail._id;

    const byAccount = await userRepository.findByAccountId(String(rawId));
    if (byAccount?._id) return byAccount._id;

    return null;
  }
}

async function notifyMentionsOnComment({ task, comment, actorAccountId, actorName }) {
  const mentions = Array.isArray(comment?.mentions) ? comment.mentions : [];
  if (!mentions.length) return [];

  const created = [];
  for (const rawId of mentions) {
    try {
      const recipientUserId = await resolveMentionRecipientUserId(rawId);
      if (!recipientUserId) {
        warn('Skipping unresolved task mention recipient', { rawId: String(rawId) });
        continue;
      }
      const row = await notifyMention({
        recipientUserId,
        task,
        commentId: comment._id,
        triggeredByAccountId: actorAccountId,
        triggeredByName: actorName,
      });
      if (row) created.push(row);
    } catch (err) {
      warn('Failed to deliver task mention notification', {
        rawId: String(rawId),
        message: err.message,
      });
    }
  }
  return created;
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  listGlobalNotifications,
  getGlobalUnreadCount,
  markGlobalNotificationRead,
  markAllGlobalNotificationsRead,
  createAndEmitNotification,
  notifyAdmins,
  notifyMention,
  notifyMentionsOnComment,
};
