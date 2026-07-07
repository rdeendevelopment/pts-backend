const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const taskNotificationService = require('../../tasks/services/taskNotification.service');

async function listNotifications(req, res) {
  const data = await taskNotificationService.listGlobalNotifications(req, req.query);
  return sendSuccess(res, data);
}

async function getUnreadCount(req, res) {
  const data = await taskNotificationService.getGlobalUnreadCount(req);
  return sendSuccess(res, data);
}

async function markRead(req, res) {
  const data = await taskNotificationService.markGlobalNotificationRead(req.params.id, req);
  return sendSuccess(res, data);
}

async function markAllRead(req, res) {
  const data = await taskNotificationService.markAllGlobalNotificationsRead(req);
  return sendSuccess(res, data);
}

module.exports = {
  listNotifications: asyncHandler(listNotifications),
  getUnreadCount: asyncHandler(getUnreadCount),
  markRead: asyncHandler(markRead),
  markAllRead: asyncHandler(markAllRead),
};
