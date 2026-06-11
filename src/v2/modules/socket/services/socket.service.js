const { AppError } = require('../../../kernel/errors');
const socketErrorCodes = require('../errors/socketErrorCodes');
const {
  getAccountRoom,
  getUserRoom,
  getRoleRoom,
  getProjectRoom,
  getTaskRoom,
  getConversationRoom,
  getDiscussFlowTopicRoom,
} = require('../helpers/socketRooms.helper');
const socketServerService = require('./socketServer.service');

function assertSocketReady() {
  if (!socketServerService.isNamespaceReady()) {
    throw new AppError('Socket service is not initialized', {
      status: 503,
      code: socketErrorCodes.SOCKET_NOT_INITIALIZED,
    });
  }
}

function getSocketServer() {
  assertSocketReady();
  return socketServerService.getNamespace();
}

function isSocketReady() {
  return socketServerService.isNamespaceReady();
}

/**
 * Attach the /v2 namespace to an existing Socket.IO server (production path)
 * or bootstrap a standalone server for tests.
 */
function initializeSocket(httpServerOrIo) {
  if (httpServerOrIo && typeof httpServerOrIo.of === 'function') {
    return socketServerService.initializeNamespace(httpServerOrIo);
  }

  return socketServerService.createStandaloneServer(httpServerOrIo);
}

function emitToRoom(room, eventName, payload) {
  assertSocketReady();
  const nsp = socketServerService.getNamespace();
  nsp.to(room).emit(eventName, payload);
}

function emitToAccount(accountId, eventName, payload) {
  emitToRoom(getAccountRoom(accountId), eventName, payload);
}

function emitToUser(userId, eventName, payload) {
  emitToRoom(getUserRoom(userId), eventName, payload);
}

function emitToRole(role, eventName, payload) {
  emitToRoom(getRoleRoom(role), eventName, payload);
}

function emitToAdmins(eventName, payload) {
  emitToRole('admin', eventName, payload);
  emitToRole('super-admin', eventName, payload);
}

function emitToProject(projectId, eventName, payload) {
  emitToRoom(getProjectRoom(projectId), eventName, payload);
}

function emitToTask(taskId, eventName, payload) {
  emitToRoom(getTaskRoom(taskId), eventName, payload);
}

function emitToConversation(conversationId, eventName, payload) {
  emitToRoom(getConversationRoom(conversationId), eventName, payload);
}

function emitToDiscussFlowTopic(topicId, eventName, payload) {
  emitToRoom(getDiscussFlowTopicRoom(topicId), eventName, payload);
}

function broadcast(eventName, payload) {
  assertSocketReady();
  const nsp = socketServerService.getNamespace();
  nsp.emit(eventName, payload);
}

function shutdownSocket() {
  socketServerService.shutdownNamespace();
}

module.exports = {
  initializeSocket,
  getSocketServer,
  isSocketReady,
  emitToAccount,
  emitToUser,
  emitToRole,
  emitToAdmins,
  emitToProject,
  emitToTask,
  emitToConversation,
  emitToDiscussFlowTopic,
  broadcast,
  shutdownSocket,
};
