const { getTaskNotificationModel } = require('../models/taskNotification.model');

async function listByUserId(userId, { unreadOnly = false, skip = 0, limit = 50 } = {}) {
  const TaskNotification = getTaskNotificationModel();
  const query = { userId };
  if (unreadOnly) query.isRead = false;

  const [items, total] = await Promise.all([
    TaskNotification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    TaskNotification.countDocuments(query),
  ]);

  return { items, total };
}

async function countUnreadByUserId(userId) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.countDocuments({ userId, isRead: false });
}

async function findMentionByComment(userId, taskId, commentId) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.findOne({
    userId,
    taskId,
    type: 'task_mentioned',
    'metadata.sourceCommentId': commentId,
  }).exec();
}

async function createNotification(payload) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.create(payload);
}

async function markReadById(notificationId, userId) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true, readAt: new Date() } },
    { returnDocument: 'after' }
  ).exec();
}

async function markAllReadByUserId(userId) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
}

async function deleteByTaskId(taskId) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.deleteMany({ taskId }).exec();
}

module.exports = {
  listByUserId,
  countUnreadByUserId,
  findMentionByComment,
  createNotification,
  markReadById,
  markAllReadByUserId,
  deleteByTaskId,
};
