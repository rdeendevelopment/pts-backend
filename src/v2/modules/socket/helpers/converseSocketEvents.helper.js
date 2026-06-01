/**
 * Converse realtime events — v2 dot-notation only (best-effort emit).
 */
const socketService = require('../services/socket.service');
const { emitBestEffort } = require('./socketEmit.helper');
const { SERVER_EVENTS } = require('../constants/socket.constants');

function emitConverseMessageCreated(conversationId, message) {
  if (!message) return;

  emitBestEffort(() => {
    socketService.emitToConversation(conversationId, SERVER_EVENTS.CONVERSE_MESSAGE_CREATED, {
      conversationId: String(conversationId),
      message,
    });
  });
}

function emitConverseConversationUpdated(conversationId, conversation) {
  if (!conversation) return;

  emitBestEffort(() => {
    socketService.emitToConversation(conversationId, SERVER_EVENTS.CONVERSE_CONVERSATION_UPDATED, {
      conversationId: String(conversationId),
      conversation,
    });
  });
}

function emitConverseTypingStopped(conversationId, userId, userName = '') {
  emitBestEffort(() => {
    socketService.emitToConversation(conversationId, SERVER_EVENTS.CONVERSE_TYPING_STOPPED, {
      conversationId: String(conversationId),
      userId: String(userId),
      userName,
      isTyping: false,
    });
  });
}

function emitConverseTypingStarted(conversationId, userId, userName = '') {
  emitBestEffort(() => {
    socketService.emitToConversation(conversationId, SERVER_EVENTS.CONVERSE_TYPING_STARTED, {
      conversationId: String(conversationId),
      userId: String(userId),
      userName,
      isTyping: true,
    });
  });
}

function emitConverseMessageRead(conversationId, payload) {
  emitBestEffort(() => {
    socketService.emitToConversation(conversationId, SERVER_EVENTS.CONVERSE_MESSAGE_READ, payload);
  });
}

function emitConverseUnreadUpdated(userId, payload) {
  emitBestEffort(() => {
    socketService.emitToUser(userId, SERVER_EVENTS.CONVERSE_UNREAD_UPDATED, payload);
  });
}

function emitConverseMessageDelivered(conversationId, message, participants = []) {
  emitConverseMessageCreated(conversationId, message);
  const update = {
    conversationId: String(conversationId),
    lastMessage: {
      _id: message?._id || message?.id,
      text: message?.text,
      type: message?.type,
      senderId: message?.senderId,
      senderName: message?.senderName,
      createdAt: message?.createdAt,
    },
  };
  emitConverseConversationUpdated(conversationId, update);

  participants.forEach((participant) => {
    const uid = String(participant.userId);
    emitConverseUnreadUpdated(uid, {
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
  emitConverseMessageRead,
  emitConverseUnreadUpdated,
  emitConverseMessageDelivered,
};
