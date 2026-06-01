const { info, warn } = require('../../../kernel/logger');
const {
  SOCKET_NAMESPACE,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  SOCKET_CORS,
} = require('../constants/socket.constants');
const { authenticateSocketHandshake } = require('../helpers/socketAuth.helper');
const {
  getAccountRoom,
  getUserRoom,
  getProjectRoom,
  getTaskRoom,
  getConversationRoom,
} = require('../helpers/socketRooms.helper');
const presenceService = require('./presence.service');
const socketRoomAccessService = require('./socketRoomAccess.service');

let namespace = null;

function isNamespaceReady() {
  return Boolean(namespace);
}

function getNamespace() {
  return namespace;
}

function emitPresenceUpdated(socket, online) {
  if (!socket.v2Auth?.userId) return;

  namespace.to(getUserRoom(socket.v2Auth.userId)).emit(SERVER_EVENTS.PRESENCE_UPDATED, {
    userId: socket.v2Auth.userId,
    accountId: socket.v2Auth.accountId,
    online,
    at: new Date().toISOString(),
  });
}

function ackResult(ack, payload) {
  if (typeof ack === 'function') {
    ack(payload);
  }
}

function registerRoomHandlers(socket) {
  socket.on(CLIENT_EVENTS.ROOM_JOIN_PROJECT, async (payload, ack) => {
    try {
      const room = await socketRoomAccessService.assertProjectRoomAccess(
        payload?.projectId,
        socket.v2Auth.userId
      );
      await socket.join(room);
      ackResult(ack, { ok: true, room });
    } catch (err) {
      ackResult(ack, { ok: false, code: err.code || 'SOCKET_FORBIDDEN', message: err.message });
    }
  });

  socket.on(CLIENT_EVENTS.ROOM_LEAVE_PROJECT, (payload, ack) => {
    try {
      const room = getProjectRoom(payload?.projectId);
      socket.leave(room);
      ackResult(ack, { ok: true, room });
    } catch (err) {
      ackResult(ack, { ok: false, code: err.code || 'SOCKET_ROOM_INVALID', message: err.message });
    }
  });

  socket.on(CLIENT_EVENTS.ROOM_JOIN_TASK, async (payload, ack) => {
    try {
      const room = await socketRoomAccessService.assertTaskRoomAccess(
        payload?.taskId,
        socket.v2Auth.userId
      );
      await socket.join(room);
      ackResult(ack, { ok: true, room });
    } catch (err) {
      ackResult(ack, { ok: false, code: err.code || 'SOCKET_FORBIDDEN', message: err.message });
    }
  });

  socket.on(CLIENT_EVENTS.ROOM_LEAVE_TASK, (payload, ack) => {
    try {
      const room = getTaskRoom(payload?.taskId);
      socket.leave(room);
      ackResult(ack, { ok: true, room });
    } catch (err) {
      ackResult(ack, { ok: false, code: err.code || 'SOCKET_ROOM_INVALID', message: err.message });
    }
  });

  socket.on(CLIENT_EVENTS.ROOM_JOIN_CONVERSATION, async (payload, ack) => {
    try {
      const room = await socketRoomAccessService.assertConversationRoomAccess(
        payload?.conversationId,
        socket.v2Auth.userId
      );
      await socket.join(room);
      ackResult(ack, { ok: true, room });
    } catch (err) {
      ackResult(ack, { ok: false, code: err.code || 'SOCKET_FORBIDDEN', message: err.message });
    }
  });

  socket.on(CLIENT_EVENTS.ROOM_LEAVE_CONVERSATION, (payload, ack) => {
    try {
      const room = getConversationRoom(payload?.conversationId);
      socket.leave(room);
      ackResult(ack, { ok: true, room });
    } catch (err) {
      ackResult(ack, { ok: false, code: err.code || 'SOCKET_ROOM_INVALID', message: err.message });
    }
  });

  const { handleTyping } = require('../../converse');

  socket.on(CLIENT_EVENTS.CONVERSE_TYPING_START, async (payload) => {
    if (!socket.v2Auth?.userId || !payload?.conversationId) return;
    try {
      const name = payload.userName || socket.v2Auth.displayName || '';
      await handleTyping(payload.conversationId, socket.v2Auth.userId, name, true);
    } catch (_err) {
      // typing is best-effort
    }
  });

  socket.on(CLIENT_EVENTS.CONVERSE_TYPING_STOP, async (payload) => {
    if (!socket.v2Auth?.userId || !payload?.conversationId) return;
    try {
      const name = payload.userName || socket.v2Auth.displayName || '';
      await handleTyping(payload.conversationId, socket.v2Auth.userId, name, false);
    } catch (_err) {
      // typing is best-effort
    }
  });
}

function handleConnection(socket) {
  const { accountId, userId } = socket.v2Auth;

  // Every authenticated socket listens on its account channel.
  socket.join(getAccountRoom(accountId));
  if (userId) {
    socket.join(getUserRoom(userId));
  }

  presenceService.addConnection({
    socketId: socket.id,
    accountId,
    userId,
  });

  emitPresenceUpdated(socket, true);
  registerRoomHandlers(socket);

  info('v2 socket connected', {
    socketId: socket.id,
    accountId,
    userId,
    rooms: [getAccountRoom(accountId), userId ? getUserRoom(userId) : null].filter(Boolean),
  });

  socket.on('disconnect', () => {
    presenceService.removeConnection(socket.id);
    emitPresenceUpdated(socket, false);

    info('v2 socket disconnected', {
      socketId: socket.id,
      accountId,
      userId,
    });
  });
}

function initializeNamespace(io) {
  if (namespace) {
    return namespace;
  }

  if (!io || typeof io.of !== 'function') {
    throw new Error('initializeNamespace requires a Socket.IO server instance');
  }

  namespace = io.of(SOCKET_NAMESPACE);

  // Reject connections without a valid v2 access token.
  namespace.use(async (socket, next) => {
    try {
      socket.v2Auth = await authenticateSocketHandshake(socket.handshake);
      return next();
    } catch (err) {
      return next(err);
    }
  });

  namespace.on('connection', handleConnection);

  info('PTS v2 socket namespace ready', { namespace: SOCKET_NAMESPACE });
  return namespace;
}

function createStandaloneServer(httpServer) {
  const { Server } = require('socket.io');
  const io = new Server(httpServer, { cors: SOCKET_CORS });
  initializeNamespace(io);
  return io;
}

function shutdownNamespace() {
  if (!namespace) return;

  try {
    namespace.disconnectSockets(true);
  } catch (err) {
    warn('v2 socket disconnectSockets failed', { message: err.message });
  }

  presenceService.resetPresence();
  namespace = null;
}

module.exports = {
  initializeNamespace,
  createStandaloneServer,
  getNamespace,
  isNamespaceReady,
  shutdownNamespace,
};
