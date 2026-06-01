const socketService = require('../services/socket.service');
const { warn } = require('../../../kernel/logger');

/** Realtime is best-effort; business actions must not fail if socket is down. */
function emitBestEffort(emitFn) {
  if (!socketService.isSocketReady()) return;

  try {
    emitFn();
  } catch (err) {
    warn('Socket emit failed (best-effort)', {
      message: err.message,
    });
  }
}

module.exports = {
  emitBestEffort,
};
