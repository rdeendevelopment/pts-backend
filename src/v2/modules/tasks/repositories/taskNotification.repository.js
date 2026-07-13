const { getTaskNotificationModel } = require('../models/taskNotification.model');

function buildTaskOnlyNotificationQuery(baseQuery = {}) {
  return {
    ...baseQuery,
    $or: [
      { entityType: 'task' },
      { taskId: { $exists: true, $ne: null } },
    ],
  };
}

function buildNotificationQuery(baseQuery = {}, { taskOnly = false } = {}) {
  return taskOnly ? buildTaskOnlyNotificationQuery(baseQuery) : { ...baseQuery };
}

async function listByUserId(userId, {
  unreadOnly = false,
  skip = 0,
  limit = 50,
  taskOnly = false,
} = {}) {
  const TaskNotification = getTaskNotificationModel();
  const query = buildNotificationQuery({ userId }, { taskOnly });
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

async function countUnreadByUserId(userId, { taskOnly = false } = {}) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.countDocuments(
    buildNotificationQuery({ userId, isRead: false }, { taskOnly })
  );
}

async function countUnreadMentionsByUserId(userId) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.countDocuments(buildNotificationQuery({
    userId,
    isRead: false,
    type: 'task_mentioned',
  }, { taskOnly: true }));
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

async function markReadById(notificationId, userId, { taskOnly = false } = {}) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.findOneAndUpdate(
    buildNotificationQuery({ _id: notificationId, userId }, { taskOnly }),
    { $set: { isRead: true, readAt: new Date() } },
    { returnDocument: 'after' }
  ).exec();
}

async function markAllReadByUserId(userId, { taskOnly = false } = {}) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.updateMany(
    buildNotificationQuery({ userId, isRead: false }, { taskOnly }),
    { $set: { isRead: true, readAt: new Date() } }
  );
}

async function deleteByTaskId(taskId) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.deleteMany({ taskId }).exec();
}

module.exports = {
  buildTaskOnlyNotificationQuery,
  listByUserId,
  countUnreadByUserId,
  countUnreadMentionsByUserId,
  findMentionByComment,
  createNotification,
  markReadById,
  markAllReadByUserId,
  deleteByTaskId,
};
