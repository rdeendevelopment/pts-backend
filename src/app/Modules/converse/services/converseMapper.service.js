const mongoose = require('mongoose');

// ─── Actor helpers ────────────────────────────────────────────────────────────

function getActorId(req) {
  return req.user._id;
}

function getActorName(req) {
  if (req.auth && req.auth.accountType === 'admin') {
    return req.user.name || req.user.email || '';
  }
  return (
    req.user.name ||
    [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') ||
    [req.user.first_name, req.user.last_name].filter(Boolean).join(' ') ||
    req.user.email ||
    ''
  );
}

// ─── ObjectId helpers ─────────────────────────────────────────────────────────

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function toObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

// ─── Safe user DTO (never exposes password / auth fields) ─────────────────────

function safeUserDTO(user) {
  if (!user) return null;
  return {
    _id: user._id,
    firstName: user.first_name || user.firstName || '',
    lastName: user.last_name || user.lastName || '',
    displayName:
      user.name ||
      [user.first_name || user.firstName, user.last_name || user.lastName]
        .filter(Boolean)
        .join(' ') ||
      user.email ||
      '',
    email: user.email || '',
    imageUrl: user.image_url || user.imageUrl || '',
  };
}

// ─── Conversation DTO ─────────────────────────────────────────────────────────

function mapConversationDTO(conv, memberDoc) {
  return {
    _id: conv._id,
    type: conv.type,
    title: conv.title || '',
    avatar: conv.avatar || '',
    memberCount: conv.memberCount || 0,
    memberIds: conv.memberIds || [],
    lastMessage: conv.lastMessage || null,
    createdBy: conv.createdBy || null,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    // per-member state
    role: memberDoc ? memberDoc.role : null,
    unreadCount: memberDoc ? memberDoc.unreadCount : 0,
    mentionCount: memberDoc ? memberDoc.mentionCount : 0,
    isMuted: memberDoc ? memberDoc.isMuted : false,
    isPinned: memberDoc ? memberDoc.isPinned : false,
    isArchived: memberDoc ? memberDoc.isArchived : false,
    lastReadAt: memberDoc ? memberDoc.lastReadAt : null,
    lastReadMessageId: memberDoc ? memberDoc.lastReadMessageId : null,
  };
}

// ─── Message DTO (masks soft-deleted content) ─────────────────────────────────

function mapMessageDTO(msg) {
  const deleted = Boolean(msg.isDeletedForEveryone);
  return {
    _id: msg._id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    senderName: msg.senderName || '',
    senderAvatar: msg.senderAvatar || '',
    sequence: msg.sequence,
    type: msg.type,
    text: deleted ? '' : msg.text || '',
    replyTo: msg.replyTo || null,
    forwardedFrom: msg.forwardedFrom || null,
    attachments: deleted ? [] : msg.attachments || [],
    reactions: msg.reactions || [],
    readBy: msg.readBy || [],
    isEdited: Boolean(msg.isEdited),
    editedAt: msg.editedAt || null,
    isDeletedForEveryone: deleted,
    deletedAt: msg.deletedAt || null,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  };
}

module.exports = {
  getActorId,
  getActorName,
  isValidObjectId,
  toObjectId,
  safeUserDTO,
  mapConversationDTO,
  mapMessageDTO,
};
