/**
 * User/account notification events via global socket module.
 * Inbox persistence is separate — this is realtime delivery only.
 */
const socketService = require('../services/socket.service');
const { emitBestEffort } = require('./socketEmit.helper');
const { SERVER_EVENTS } = require('../constants/socket.constants');

function emitNotificationCreated({ accountId = null, userId = null, notification }) {
  if (!notification) return;

  const payload = { notification };

  emitBestEffort(() => {
    if (userId) {
      socketService.emitToUser(userId, SERVER_EVENTS.NOTIFICATION_CREATED, payload);
      return;
    }

    if (accountId) {
      socketService.emitToAccount(accountId, SERVER_EVENTS.NOTIFICATION_CREATED, payload);
    }
  });
}

function emitSystemAlert(payload) {
  emitBestEffort(() => {
    socketService.broadcast(SERVER_EVENTS.SYSTEM_ALERT, payload);
  });
}

module.exports = {
  emitNotificationCreated,
  emitSystemAlert,
};
