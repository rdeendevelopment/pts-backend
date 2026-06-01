const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { warn } = require('../../../kernel/logger');
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

function emptyNotificationPage(query = {}) {
  const pagination = parseNotificationListQuery(query);
  return {
    items: [],
    pagination: buildPaginationMeta({ ...pagination, total: 0 }),
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
  });

  return {
    items: items.map(toNotificationDto),
    pagination: buildPaginationMeta({ ...pagination, total }),
  };
}

async function getUnreadCount(req) {
  const userId = await resolveNotificationUserId(req, findUserIdFromAuth);
  if (!userId) return { count: 0 };

  const count = await taskNotificationRepository.countUnreadByUserId(userId);
  return { count };
}

async function markNotificationRead(notificationId, req) {
  const userId = await resolveNotificationUserId(req, findUserIdFromAuth);
  if (!userId) {
    throw new AppError('Notification not found', { status: 404 });
  }
  const id = assertObjectId(notificationId, 'notificationId');
  const row = await taskNotificationRepository.markReadById(id, userId);

  if (!row) {
    throw new AppError('Notification not found', { status: 404 });
  }

  return toNotificationDto(row);
}

async function markAllNotificationsRead(req) {
  const userId = await resolveNotificationUserId(req, findUserIdFromAuth);
  if (userId) {
    await taskNotificationRepository.markAllReadByUserId(userId);
  }
  return { success: true };
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
  notifyMention,
  notifyMentionsOnComment,
};
