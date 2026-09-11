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
  attentionOnly = false,
  readState = 'all', category = null, module = null, projectId = null, search = '', dateFrom = null, dateTo = null,
} = {}) {
  const TaskNotification = getTaskNotificationModel();
  const query = buildNotificationQuery({ userId }, { taskOnly });
  if (unreadOnly) query.isRead = false;
  if (readState === 'unread') query.isRead = false;
  if (readState === 'read') query.isRead = true;
  if (attentionOnly) {
    const attentionPattern = 'mention|repl|assigned|responsibility|collaborator_added|review|(^|_)qa(_|$)|blocked|unblocked|priority.*(high|urgent)|due_today|overdue|reopened';
    query.$and = [...(query.$and || []), { $or: [
      { type: { $regex: attentionPattern, $options: 'i' } },
      { eventKey: { $regex: attentionPattern, $options: 'i' } },
      { title: { $regex: attentionPattern, $options: 'i' } },
      { body: { $regex: attentionPattern, $options: 'i' } },
    ] }];
  }
  if (category) {
    const patterns = {
      assignment: 'assign|responsibility', collaboration: 'collaborator', mention: 'mention',
      comment: 'comment|reply', review: 'review|_qa|to_qa', priority: 'priority',
      due_date: 'due|overdue', status: 'status|moved|blocked|unblocked', completion: 'completed',
      task_lifecycle: 'archived|restored|deleted|reopened|created',
    };
    query.$and = [...(query.$and || []), { $or: [
      { category },
      { category: { $exists: false }, type: { $regex: patterns[category] || category, $options: 'i' } },
      { category: null, type: { $regex: patterns[category] || category, $options: 'i' } },
    ] }];
  }
  if (projectId) query.projectId = projectId;
  if (module) query.module = module === 'tasks' ? { $in: ['tasks', 'task'] }
    : module === 'timesheets' ? { $in: ['timesheets', 'activity'] } : module;
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const exclusiveEnd = new Date(dateTo);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      query.createdAt.$lt = exclusiveEnd;
    }
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$and = [...(query.$and || []), { $or: [
      { title: { $regex: escaped, $options: 'i' } },
      { body: { $regex: escaped, $options: 'i' } },
      { actorName: { $regex: escaped, $options: 'i' } },
      { 'metadata.taskTitle': { $regex: escaped, $options: 'i' } },
      { 'metadata.taskDisplayId': { $regex: escaped, $options: 'i' } },
      { 'metadata.projectName': { $regex: escaped, $options: 'i' } },
      { 'metadata.periodLabel': { $regex: escaped, $options: 'i' } },
      { 'metadata.userName': { $regex: escaped, $options: 'i' } },
    ] }];
  }

  const [items, total] = await Promise.all([
    TaskNotification.find(query)
      .sort(attentionOnly ? { isRead: 1, createdAt: -1 } : { createdAt: -1 })
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

async function createDedupedNotification(payload) {
  if (!payload.dedupeKey) return { notification: await createNotification(payload), created: true };
  const TaskNotification = getTaskNotificationModel();
  const { lastOccurredAt, ...insertPayload } = payload;
  const result = await TaskNotification.findOneAndUpdate(
    { userId: payload.userId, dedupeKey: payload.dedupeKey },
    {
      $setOnInsert: insertPayload,
      $set: { lastOccurredAt: lastOccurredAt || new Date() },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, includeResultMetadata: true }
  ).exec();
  return { notification: result.value, created: Boolean(result.lastErrorObject?.upserted) };
}

async function markReadById(notificationId, userId, { taskOnly = false } = {}) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.findOneAndUpdate(
    buildNotificationQuery({ _id: notificationId, userId }, { taskOnly }),
    { $set: { isRead: true, readAt: new Date() } },
    { returnDocument: 'after' }
  ).exec();
}

async function markUnreadById(notificationId, userId, { taskOnly = false } = {}) {
  const TaskNotification = getTaskNotificationModel();
  return TaskNotification.findOneAndUpdate(
    buildNotificationQuery({ _id: notificationId, userId }, { taskOnly }),
    { $set: { isRead: false, readAt: null } },
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
  createDedupedNotification,
  markReadById,
  markUnreadById,
  markAllReadByUserId,
  deleteByTaskId,
};
