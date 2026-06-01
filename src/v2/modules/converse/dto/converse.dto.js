function toUserSummaryDto(user) {
  if (!user) return null;
  const doc = user.toObject ? user.toObject() : user;
  return {
    id: String(doc._id),
    _id: String(doc._id),
    userId: String(doc._id),
    displayName: doc.displayName
      || [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim()
      || doc.email,
    email: doc.email || '',
    imageUrl: doc.avatarUrl || '',
    avatar: doc.avatarUrl || '',
    role: doc.role || '',
  };
}

function toLastMessageDto(lastMessage) {
  if (!lastMessage) return null;
  return {
    _id: lastMessage.messageId ? String(lastMessage.messageId) : undefined,
    text: lastMessage.text || '',
    type: lastMessage.type || 'text',
    senderId: lastMessage.senderId ? String(lastMessage.senderId) : undefined,
    senderName: lastMessage.senderName || '',
    createdAt: lastMessage.createdAt || null,
  };
}

function toConversationDto(conversation, participant, extras = {}) {
  if (!conversation) return null;
  const doc = conversation.toObject ? conversation.toObject() : conversation;

  return {
    id: String(doc._id),
    _id: String(doc._id),
    type: doc.type,
    title: doc.title || '',
    avatar: doc.avatar || '',
    memberCount: Number(doc.memberCount || 0),
    memberIds: extras.memberIds || [],
    adminIds: (doc.adminUserIds || []).map(String),
    lastMessage: toLastMessageDto(doc.lastMessage),
    unreadCount: Number(participant?.unreadCount || 0),
    mentionCount: Number(participant?.mentionCount || 0),
    isMuted: Boolean(participant?.isMuted),
    isPinned: Boolean(participant?.isPinned),
    isArchived: Boolean(participant?.isArchived),
    directUser: extras.directUser || null,
    members: extras.members || undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toMessageDto(message, senderName = '') {
  if (!message) return null;
  const doc = message.toObject ? message.toObject() : message;

  return {
    id: String(doc._id),
    _id: String(doc._id),
    conversationId: String(doc.conversationId),
    senderId: String(doc.senderId),
    senderName: senderName || doc.senderName || '',
    sequence: doc.sequence,
    type: doc.type || 'text',
    text: doc.text || '',
    replyTo: doc.replyTo || null,
    attachments: doc.attachments || [],
    reactions: doc.reactions || [],
    readBy: doc.readBy || [],
    isEdited: Boolean(doc.isEdited),
    isDeletedForEveryone: Boolean(doc.isDeletedForEveryone),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = {
  toUserSummaryDto,
  toConversationDto,
  toMessageDto,
  toLastMessageDto,
};
