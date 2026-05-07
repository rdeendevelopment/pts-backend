const Notification = require('../../MongoModels/notification.model');
const { sendToUser } = require('./socket.service');

function normalizeUserRef(userId) {
  if (!userId) return null;
  if (typeof userId === 'object') return userId._id || userId.id || null;
  return String(userId);
}

function normalizeObjectIdRef(value) {
  if (!value) return null;
  const raw = typeof value === 'object' && value._id ? value._id : value;
  const str = String(raw);
  return /^[a-f\d]{24}$/i.test(str) ? str : null;
}

async function createNotification(data) {
  const payload = {
    ...data,
    userId: normalizeUserRef(data.userId),
    triggeredBy: normalizeUserRef(data.triggeredBy),
    projectId: normalizeObjectIdRef(data.projectId),
  };
  const notification = await Notification.create(payload);
  sendToUser(payload.userId, 'notification', notification.toObject());
  return notification.toObject();
}

async function createSystemNotification(data) {
  return createNotification({
    ...data,
    taskId: normalizeObjectIdRef(data.taskId),
    triggeredBy: normalizeObjectIdRef(data.triggeredBy),
  });
}

async function createNotificationsForMany(userIds, data) {
  const results = [];
  const triggeredBy = normalizeUserRef(data.triggeredBy);
  for (const userId of userIds) {
    const normalizedUserId = normalizeUserRef(userId);
    if (!normalizedUserId || String(normalizedUserId) === String(triggeredBy)) continue;
    const n = await createNotification({ ...data, userId: normalizedUserId, triggeredBy });
    results.push(n);
  }
  return results;
}

async function getNotifications(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const query = { userId: normalizeUserRef(userId) };

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ ...query, isRead: false }),
  ]);

  return { notifications, total, unreadCount };
}

async function markAsRead(userId, notificationId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId: normalizeUserRef(userId) },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).lean();

  if (!notification) {
    const err = new Error('Notification not found');
    err.status = 404;
    throw err;
  }

  return notification;
}

async function markAllAsRead(userId) {
  await Notification.updateMany(
    { userId: normalizeUserRef(userId), isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
}

async function getUnreadCount(userId) {
  return Notification.countDocuments({ userId: normalizeUserRef(userId), isRead: false });
}

module.exports = {
  createNotification,
  createSystemNotification,
  createNotificationsForMany,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};
