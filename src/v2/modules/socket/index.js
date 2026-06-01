const routes = require('./socket.routes');
const socketService = require('./services/socket.service');
const presenceService = require('./services/presence.service');

module.exports = {
  routes,
  initializeSocket: socketService.initializeSocket,
  getSocketServer: socketService.getSocketServer,
  isSocketReady: socketService.isSocketReady,
  emitToAccount: socketService.emitToAccount,
  emitToUser: socketService.emitToUser,
  emitToProject: socketService.emitToProject,
  emitToTask: socketService.emitToTask,
  emitToConversation: socketService.emitToConversation,
  broadcast: socketService.broadcast,
  shutdownSocket: socketService.shutdownSocket,
  presenceService,
};
