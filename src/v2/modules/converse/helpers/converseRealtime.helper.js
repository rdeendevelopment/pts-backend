const socketService = require('../../socket/services/socket.service');
const { emitBestEffort } = require('../../socket/helpers/socketEmit.helper');
const {
  emitConverseMessageCreated,
  emitConverseConversationUpdated,
  emitConverseTypingStarted,
  emitConverseTypingStopped,
} = require('../../socket/helpers/converseSocketEvents.helper');
const { SERVER_EVENTS } = require('../../socket/constants/socket.constants');

function emitUnreadUpdated(userId, payload) {
  emitBestEffort(() => {
    socketService.emitToUser(userId, 'converse.unread.updated', payload);
  });
}

function emitMessageRead(conversationId, payload) {
  emitBestEffort(() => {
    socketService.emitToConversation(conversationId, SERVER_EVENTS.CONVERSE_MESSAGE_READ || 'converse.message.read', payload);
  });
}

function broadcastConversationEvent(conversationId, participants, handlers) {
  handlers.forEach((handler) => {
    emitBestEffort(() => handler());
  });

  (participants || []).forEach((participant) => {
    const userId = String(participant.userId);
    emitUnreadUpdated(userId, {
      conversationId: String(conversationId),
      unreadCount: Number(participant.unreadCount || 0),
    });
  });
}

module.exports = {
  emitConverseMessageCreated,
  emitConverseConversationUpdated,
  emitConverseTypingStarted,
  emitConverseTypingStopped,
  emitUnreadUpdated,
  emitMessageRead,
  broadcastConversationEvent,
};
