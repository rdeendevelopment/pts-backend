const Message = require('../models/message.model');
const ConversationMember = require('../models/conversationMember.model');
const socketEmitter = require('./socketEmitter.service');

async function markRead(messageId, actorId) {
  const msg = await Message.findOne({ _id: messageId }).lean();
  if (!msg) throw Object.assign(new Error('Message not found'), { statusCode: 404 });

  const member = await ConversationMember.findOne({
    conversationId: msg.conversationId,
    userId: actorId,
    leftAt: null,
  }).lean();
  if (!member) throw Object.assign(new Error('Not a member of this conversation'), { statusCode: 403 });

  const now = new Date();

  await ConversationMember.updateOne(
    { conversationId: msg.conversationId, userId: actorId },
    { $set: { unreadCount: 0, mentionCount: 0, lastReadAt: now, lastReadMessageId: messageId } }
  );

  await Message.updateOne(
    { _id: messageId, 'readBy.userId': { $ne: actorId } },
    { $push: { readBy: { userId: actorId, readAt: now } } }
  );

  // Notify the caller's personal room so other tabs reset their badge
  socketEmitter.emitToUser(actorId, 'converse:unread_updated', {
    conversationId: String(msg.conversationId),
    unreadCount: 0,
    lastReadMessageId: String(messageId),
  });

  // Lightweight read receipt to the conversation room
  socketEmitter.emitToConversation(msg.conversationId, 'converse:message_read', {
    conversationId: String(msg.conversationId),
    messageId: String(messageId),
    userId: String(actorId),
    readAt: now,
  });
}

module.exports = { markRead };
