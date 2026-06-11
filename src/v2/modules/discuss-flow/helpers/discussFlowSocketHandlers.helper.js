const { getDiscussFlowTopicRoom } = require('../../socket/helpers/socketRooms.helper');
const { DISCUSSFLOW_CLIENT_EVENTS } = require('../constants/discussFlowSocket.constants');
const discussFlowSocketAccessService = require('../services/discussFlowSocketAccess.service');
const {
  joinTopicRoom,
  leaveTopicRoom,
  emitTyping,
} = require('./discussFlowSocketEvents.helper');

function ackResult(ack, payload) {
  if (typeof ack === 'function') {
    ack(payload);
  }
}

function registerDiscussFlowSocketHandlers(socket) {
  socket.on(DISCUSSFLOW_CLIENT_EVENTS.ROOM_JOIN_TOPIC, async (payload, ack) => {
    try {
      const room = await discussFlowSocketAccessService.assertDiscussFlowTopicRoomAccess(
        payload?.topicId,
        socket.v2Auth.userId || socket.v2Auth.accountId
      );
      await joinTopicRoom(socket, payload.topicId);
      ackResult(ack, { ok: true, room });
    } catch (err) {
      ackResult(ack, { ok: false, code: err.code || 'SOCKET_FORBIDDEN', message: err.message });
    }
  });

  socket.on(DISCUSSFLOW_CLIENT_EVENTS.ROOM_LEAVE_TOPIC, (payload, ack) => {
    try {
      const room = getDiscussFlowTopicRoom(payload?.topicId);
      leaveTopicRoom(socket, payload.topicId);
      ackResult(ack, { ok: true, room });
    } catch (err) {
      ackResult(ack, { ok: false, code: err.code || 'SOCKET_ROOM_INVALID', message: err.message });
    }
  });

  socket.on(DISCUSSFLOW_CLIENT_EVENTS.TYPING_START, (payload) => {
    if (!payload?.topicId || !socket.v2Auth?.accountId) return;
    emitTyping(payload.topicId, {
      topicId: String(payload.topicId),
      actorId: String(socket.v2Auth.accountId),
      actorName: payload.actorName || socket.v2Auth.displayName || null,
    }, true);
  });

  socket.on(DISCUSSFLOW_CLIENT_EVENTS.TYPING_STOP, (payload) => {
    if (!payload?.topicId || !socket.v2Auth?.accountId) return;
    emitTyping(payload.topicId, {
      topicId: String(payload.topicId),
      actorId: String(socket.v2Auth.accountId),
      actorName: payload.actorName || socket.v2Auth.displayName || null,
    }, false);
  });
}

module.exports = {
  registerDiscussFlowSocketHandlers,
};
