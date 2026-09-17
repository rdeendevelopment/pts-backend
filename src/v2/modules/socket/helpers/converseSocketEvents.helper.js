/**
 * Converse realtime events — v2 dot-notation only (best-effort emit).
 */
const socketService = () => require('../services/socket.service');
const { emitBestEffort } = require('./socketEmit.helper');
const { SERVER_EVENTS } = require('../constants/socket.constants');
const { getUserRoom, getConversationRoom } = require('./socketRooms.helper');

function evictConverseUserFromRoom(conversationId, userId) {
  emitBestEffort(() => {
    socketService().getSocketServer()
      .in(getUserRoom(userId))
      .socketsLeave(getConversationRoom(conversationId));
  });
}

function emitToParticipants(participants, eventName, payload) {
  const seen = new Set();
  (participants || []).forEach((participant) => {
    const userId = String(participant.userId);
    if (seen.has(userId)) return;
    seen.add(userId);
    emitBestEffort(() => socketService().emitToUser(userId, eventName, payload));
  });
}

function emitConverseMessageCreated(conversationId, message, participants = []) {
  if (!message) return;
  emitToParticipants(participants, SERVER_EVENTS.CONVERSE_MESSAGE_CREATED, {
    conversationId: String(conversationId), message,
  });
}

function emitConverseMessageUpdated(conversationId, message, participants = []) {
  emitToParticipants(participants, SERVER_EVENTS.CONVERSE_MESSAGE_UPDATED, {
    conversationId: String(conversationId), message,
  });
}

function emitConverseMessageDeleted(conversationId, message, participants = []) {
  emitToParticipants(participants, SERVER_EVENTS.CONVERSE_MESSAGE_DELETED, {
    conversationId: String(conversationId), message,
  });
}

function emitConverseConversationAvailable(userId, conversation) {
  emitBestEffort(() => socketService().emitToUser(userId, SERVER_EVENTS.CONVERSE_CONVERSATION_UPDATED, {
    conversationId: String(conversation._id), conversation,
  }));
}

function emitConverseMembershipUpdated(conversationId, payload, userId = null) {
  emitBestEffort(() => {
    if (userId) socketService().emitToUser(userId, SERVER_EVENTS.CONVERSE_MEMBERSHIP_UPDATED, payload);
    else socketService().emitToConversation(conversationId, SERVER_EVENTS.CONVERSE_MEMBERSHIP_UPDATED, payload);
  });
}

function emitConverseConversationUpdated(conversationId, conversation) {
  if (!conversation) return;

  emitBestEffort(() => {
    socketService().emitToConversation(conversationId, SERVER_EVENTS.CONVERSE_CONVERSATION_UPDATED, {
      conversationId: String(conversationId),
      conversation,
    });
  });
}

function emitConverseTypingStopped(conversationId, userId, userName = '', participants = []) {
  emitToParticipants(participants, SERVER_EVENTS.CONVERSE_TYPING_STOPPED, {
      conversationId: String(conversationId),
      userId: String(userId),
      userName,
      isTyping: false,
  });
}

function emitConverseTypingStarted(conversationId, userId, userName = '', participants = []) {
  emitToParticipants(participants, SERVER_EVENTS.CONVERSE_TYPING_STARTED, {
      conversationId: String(conversationId),
      userId: String(userId),
      userName,
      isTyping: true,
  });
}

function emitConverseMessageRead(conversationId, payload, participants = []) {
  emitToParticipants(participants, SERVER_EVENTS.CONVERSE_MESSAGE_READ, payload);
}

function emitConverseUnreadUpdated(userId, payload) {
  emitBestEffort(() => {
    socketService().emitToUser(userId, SERVER_EVENTS.CONVERSE_UNREAD_UPDATED, payload);
  });
}

function emitConverseDeliveryAcknowledgement(senderUserId, conversationId, messageId) {
  emitBestEffort(() => {
    socketService().emitToUser(senderUserId, SERVER_EVENTS.CONVERSE_MESSAGE_DELIVERED, {
      conversationId: String(conversationId),
      messageId: String(messageId),
    });
  });
}

function emitConverseMessageDelivered(conversationId, message, participants = []) {
  emitConverseMessageCreated(conversationId, message, participants);
  const update = {
    _id: String(conversationId),
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
  emitToParticipants(participants, SERVER_EVENTS.CONVERSE_CONVERSATION_UPDATED, {
    conversationId: String(conversationId), conversation: update,
  });

  const unreadSent = new Set();
  participants.forEach((participant) => {
    const uid = String(participant.userId);
    if (unreadSent.has(uid)) return;
    unreadSent.add(uid);
    emitConverseUnreadUpdated(uid, {
      conversationId: String(conversationId),
      unreadCount: Number(participant.unreadCount || 0),
    });
  });
}

function emitUserPresenceUpdated(userId, presence) {
  emitBestEffort(() => {
    socketService().emitToUser(String(userId), SERVER_EVENTS.PRESENCE_UPDATED, presence);
  });
  const globalSocket = socketService().getSocketServer();
  if (globalSocket) {
    emitBestEffort(() => {
      globalSocket.emit(SERVER_EVENTS.PRESENCE_UPDATED, {
        userId: String(userId),
        ...presence,
      });
    });
  }
}

module.exports = {
  emitConverseMessageCreated,
  emitConverseMessageUpdated,
  emitConverseMessageDeleted,
  emitConverseConversationAvailable,
  emitConverseMembershipUpdated,
  emitConverseConversationUpdated,
  emitConverseTypingStarted,
  emitConverseTypingStopped,
  emitConverseMessageRead,
  emitConverseUnreadUpdated,
  emitConverseMessageDelivered,
  emitConverseDeliveryAcknowledgement,
  evictConverseUserFromRoom,
  emitUserPresenceUpdated,
};
