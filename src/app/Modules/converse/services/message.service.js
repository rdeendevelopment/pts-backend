const mongoose = require('mongoose');
const Message = require('../models/message.model');
const MessagePin = require('../models/messagePin.model');
const Conversation = require('../models/conversation.model');
const ConversationMember = require('../models/conversationMember.model');
const { AccountAdmin, CoreUser } = require('../../../MongoModels/core.model');
const { sanitizeText } = require('../utils/sanitizeMessage.util');
const { normalizePagination, buildPageMeta } = require('../utils/pagination.util');
const { MESSAGE_TYPES, MEMBER_ROLES } = require('../constants/converse.constants');
const { mapMessageDTO } = require('./converseMapper.service');
const socketEmitter = require('./socketEmitter.service');

// ─── Sequence ─────────────────────────────────────────────────────────────────

async function _nextSeq(conversationId) {
  const last = await Message.findOne({ conversationId })
    .sort({ sequence: -1 })
    .select('sequence')
    .lean();
  return (last ? last.sequence : 0) + 1;
}

// ─── Membership guard (used by message-level operations) ──────────────────────

async function _requireMember(conversationId, actorId) {
  const member = await ConversationMember.findOne({
    conversationId,
    userId: actorId,
    leftAt: null,
  }).lean();
  if (!member) {
    throw Object.assign(new Error('Not a member of this conversation'), { statusCode: 403 });
  }
  return member;
}

// ─── List messages (paginated, cursor by sequence desc) ───────────────────────

async function listMessages(conversationId, actorId, query) {
  const { page, limit, skip } = normalizePagination(query);

  const filter = {
    conversationId,
    isDeletedForEveryone: false,
    deletedForUsers: { $ne: actorId },
  };

  const [messages, total] = await Promise.all([
    Message.find(filter).sort({ sequence: -1 }).skip(skip).limit(limit).lean(),
    Message.countDocuments(filter),
  ]);

  return {
    data: await enrichMessageDTOs(messages),
    meta: buildPageMeta(page, limit, total),
  };
}

// ─── Send message ─────────────────────────────────────────────────────────────

async function sendMessage(actorId, actorName, { conversationId, text, replyToMessageId, attachments }) {
  await _requireMember(conversationId, actorId);

  const sanitized = text ? sanitizeText(text) : '';
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  if (!sanitized && !hasAttachments) {
    throw Object.assign(new Error('Message must contain text or at least one attachment'), { statusCode: 422 });
  }

  let replyTo = null;
  if (replyToMessageId) {
    const original = await Message.findOne({ _id: replyToMessageId, conversationId }).lean();
    if (original) {
      replyTo = {
        messageId: original._id,
        text: original.isDeletedForEveryone ? '' : (original.text || ''),
        senderId: original.senderId,
        senderName: '',
      };
    }
  }

  const sequence = await _nextSeq(conversationId);
  const msgType = hasAttachments ? MESSAGE_TYPES.FILE : MESSAGE_TYPES.TEXT;

  const msg = await Message.create({
    conversationId,
    senderId: actorId,
    sequence,
    type: msgType,
    text: sanitized,
    replyTo,
    attachments: hasAttachments ? attachments : [],
    readBy: [{ userId: actorId, readAt: new Date() }],
  });

  // Update lastMessage snapshot on conversation
  await Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessage: {
          _id: msg._id,
          text: sanitized,
          type: msgType,
          senderId: actorId,
          senderName: actorName,
          createdAt: msg.createdAt,
        },
      },
    }
  );

  // Increment unread for all other active members (muted members still get count)
  await ConversationMember.updateMany(
    { conversationId, userId: { $ne: actorId }, leftAt: null },
    { $inc: { unreadCount: 1 } }
  );

  const dto = mapMessageDTO({ ...msg.toObject(), senderName: actorName });
  const activeMembers = await ConversationMember.find({ conversationId, leftAt: null, isDeletedForMe: false })
    .select('userId unreadCount')
    .lean();
  const conversationUpdate = {
    conversationId: String(conversationId),
    lastMessage: {
      _id: msg._id,
      text: sanitized,
      type: msgType,
      senderId: String(actorId),
      senderName: actorName,
      createdAt: msg.createdAt,
    },
  };

  socketEmitter.emitToConversation(conversationId, 'converse:new_message', dto);
  socketEmitter.emitToConversation(conversationId, 'converse:conversation_updated', conversationUpdate);
  socketEmitter.emitToConversation(conversationId, 'converse:unread_updated', {
    conversationId: String(conversationId),
  });
  activeMembers.forEach((member) => {
    socketEmitter.emitToUser(member.userId, 'converse:new_message', dto);
    socketEmitter.emitToUser(member.userId, 'converse:conversation_updated', conversationUpdate);
    socketEmitter.emitToUser(member.userId, 'converse:unread_updated', {
      conversationId: String(conversationId),
      unreadCount: String(member.userId) === String(actorId) ? 0 : Number(member.unreadCount || 0),
    });
  });

  return dto;
}

async function enrichMessageDTOs(messages) {
  const senderIds = Array.from(new Set(messages.map((message) => String(message.senderId || '')).filter(Boolean)));
  if (!senderIds.length) return messages.map(mapMessageDTO);

  const objectIds = senderIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const [users, admins] = await Promise.all([
    CoreUser.find({ _id: { $in: objectIds } }).select('_id firstName lastName email imageUrl').lean(),
    AccountAdmin.find({ _id: { $in: objectIds } }).select('_id name email imageUrl').lean(),
  ]);

  const names = new Map();
  users.forEach((user) => names.set(String(user._id), {
    senderName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '',
    senderAvatar: user.imageUrl || '',
  }));
  admins.forEach((user) => names.set(String(user._id), {
    senderName: user.name || user.email || '',
    senderAvatar: user.imageUrl || '',
  }));

  return messages.map((message) => {
    const sender = names.get(String(message.senderId || '')) || {};
    return mapMessageDTO({ ...message, ...sender });
  });
}

// ─── Edit message ─────────────────────────────────────────────────────────────

async function editMessage(messageId, actorId, newText) {
  const sanitized = sanitizeText(newText);
  if (!sanitized) throw Object.assign(new Error('Text cannot be empty after sanitization'), { statusCode: 422 });

  const msg = await Message.findOne({ _id: messageId, senderId: actorId });
  if (!msg) throw Object.assign(new Error('Message not found or you are not the sender'), { statusCode: 404 });
  if (msg.isDeletedForEveryone) throw Object.assign(new Error('Cannot edit a deleted message'), { statusCode: 422 });

  msg.text = sanitized;
  msg.isEdited = true;
  msg.editedAt = new Date();
  await msg.save();

  const dto = mapMessageDTO(msg.toObject());
  socketEmitter.emitToConversation(msg.conversationId, 'converse:message_edited', dto);
  return dto;
}

// ─── Delete for everyone ──────────────────────────────────────────────────────

async function deleteForEveryone(messageId, actorId) {
  const msg = await Message.findOne({ _id: messageId });
  if (!msg) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
  if (msg.isDeletedForEveryone) throw Object.assign(new Error('Message is already deleted'), { statusCode: 422 });

  const member = await _requireMember(msg.conversationId, actorId);

  const isSender = String(msg.senderId) === String(actorId);
  const isGroupAdmin = [MEMBER_ROLES.OWNER, MEMBER_ROLES.ADMIN].includes(member.role);

  if (!isSender && !isGroupAdmin) {
    throw Object.assign(new Error('You do not have permission to delete this message'), { statusCode: 403 });
  }

  msg.isDeletedForEveryone = true;
  msg.deletedAt = new Date();
  msg.deletedBy = actorId;
  msg.text = '';
  msg.attachments = [];
  await msg.save();

  const dto = mapMessageDTO(msg.toObject());
  socketEmitter.emitToConversation(msg.conversationId, 'converse:message_deleted', {
    messageId: String(messageId),
    conversationId: String(msg.conversationId),
    isDeletedForEveryone: true,
  });
  return dto;
}

// ─── Pin ──────────────────────────────────────────────────────────────────────

async function pinMessage(messageId, actorId) {
  const msg = await Message.findOne({ _id: messageId, isDeletedForEveryone: false }).lean();
  if (!msg) throw Object.assign(new Error('Message not found'), { statusCode: 404 });

  await _requireMember(msg.conversationId, actorId);

  const pin = await MessagePin.findOneAndUpdate(
    { conversationId: msg.conversationId, messageId },
    {
      $setOnInsert: {
        conversationId: msg.conversationId,
        messageId,
        messagePreview: (msg.text || '').slice(0, 120),
        pinnedBy: actorId,
        pinnedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after' }
  ).lean();

  return pin;
}

// ─── Unpin ────────────────────────────────────────────────────────────────────

async function unpinMessage(messageId, actorId) {
  const msg = await Message.findOne({ _id: messageId }).lean();
  if (!msg) throw Object.assign(new Error('Message not found'), { statusCode: 404 });

  await _requireMember(msg.conversationId, actorId);

  const deleted = await MessagePin.findOneAndDelete({
    conversationId: msg.conversationId,
    messageId,
  }).lean();

  if (!deleted) throw Object.assign(new Error('Pin not found'), { statusCode: 404 });
  return deleted;
}

// ─── Forward ──────────────────────────────────────────────────────────────────

async function forwardMessage(sourceMessageId, actorId, actorName, targetConversationIds) {
  const sourceMsg = await Message.findOne({
    _id: sourceMessageId,
    isDeletedForEveryone: false,
  }).lean();
  if (!sourceMsg) throw Object.assign(new Error('Source message not found'), { statusCode: 404 });

  // Verify actor is a member of the source conversation
  await _requireMember(sourceMsg.conversationId, actorId);

  const results = [];

  for (const targetConvId of targetConversationIds) {
    // Verify membership in each target conversation — silently skip if not member
    const targetMember = await ConversationMember.findOne({
      conversationId: targetConvId,
      userId: actorId,
      leftAt: null,
    }).lean();
    if (!targetMember) continue;

    const sequence = await _nextSeq(targetConvId);
    const msg = await Message.create({
      conversationId: targetConvId,
      senderId: actorId,
      sequence,
      type: sourceMsg.type,
      text: sourceMsg.text || '',
      attachments: sourceMsg.attachments || [],
      forwardedFrom: {
        messageId: sourceMsg._id,
        conversationId: sourceMsg.conversationId,
        senderId: sourceMsg.senderId,
      },
      readBy: [{ userId: actorId, readAt: new Date() }],
    });

    await Conversation.updateOne(
      { _id: targetConvId },
      {
        $set: {
          lastMessage: {
            _id: msg._id,
            text: msg.text,
            type: msg.type,
            senderId: actorId,
            senderName: actorName,
            createdAt: msg.createdAt,
          },
        },
      }
    );

    await ConversationMember.updateMany(
      { conversationId: targetConvId, userId: { $ne: actorId }, leftAt: null },
      { $inc: { unreadCount: 1 } }
    );

    results.push(mapMessageDTO(msg.toObject()));
  }

  return results;
}

module.exports = {
  listMessages,
  sendMessage,
  editMessage,
  deleteForEveryone,
  pinMessage,
  unpinMessage,
  forwardMessage,
};
