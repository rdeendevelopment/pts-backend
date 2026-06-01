const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { SOCKET_NAMESPACE } = require('../constants/socket.constants');
const presenceService = require('../services/presence.service');
const socketService = require('../services/socket.service');

async function getHealth(_req, res) {
  const ready = socketService.isSocketReady();
  const snapshot = presenceService.getPresenceSnapshot();

  return sendSuccess(res, {
    ready,
    namespace: SOCKET_NAMESPACE,
    activeSockets: snapshot.totals.activeSockets,
    onlineAccounts: snapshot.totals.onlineAccounts,
    onlineUsers: snapshot.totals.onlineUsers,
  });
}

async function getPresence(_req, res) {
  const snapshot = presenceService.getPresenceSnapshot();
  return sendSuccess(res, snapshot);
}

module.exports = {
  getHealth: asyncHandler(getHealth),
  getPresence: asyncHandler(getPresence),
};
