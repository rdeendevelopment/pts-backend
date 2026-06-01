const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const userRepository = require('../../users/repositories/user.repository');
const presenceService = require('../../socket/services/presence.service');
const {
  CONVERSATION_TYPES,
  MEMBER_ROLES,
  MESSAGE_TYPES,
  MIN_GROUP_PARTICIPANTS,
  MAX_GROUP_TITLE_LENGTH,
} = require('../constants/converse.constants');
const converseErrorCodes = require('../errors/converseErrorCodes');
const { makeDirectKey } = require('../helpers/directKey.helper');
const { sanitizeText } = require('../helpers/sanitizeText.helper');
const { getActiveParticipantOrThrow, assertCanManageParticipants } = require('../helpers/access.helper');
const {
  emitConverseMessageDelivered,
  emitConverseConversationUpdated,
  emitConverseMessageRead,
  emitConverseUnreadUpdated,
  emitConverseTypingStarted,
  emitConverseTypingStopped,
} = require('../../socket/helpers/converseSocketEvents.helper');
const conversationRepository = require('../repositories/conversation.repository');
const participantRepository = require('../repositories/participant.repository');
const messageRepository = require('../repositories/message.repository');
const { toConversationDto, toMessageDto, toUserSummaryDto } = require('../dto/converse.dto');

async function resolveUsersMap(userIds = []) {
  const unique = [...new Set(userIds.map((id) => String(id)).filter(Boolean))];
  const map = new Map();
  await Promise.all(unique.map(async (id) => {
    const user = await userRepository.findById(id);
    if (user) map.set(id, toUserSummaryDto(user));
  }));
  return map;
}

async function enrichDirectConversation(dto, actorUserId) {
  if (!dto || dto.type !== CONVERSATION_TYPES.DIRECT) return dto;
  const otherId = (dto.memberIds || []).find((id) => String(id) !== String(actorUserId));
  if (!otherId) return dto;
  const users = await resolveUsersMap([otherId]);
  const directUser = users.get(String(otherId));
  if (directUser) {
    dto.directUser = directUser;
    if (!dto.title) dto.title = directUser.displayName || directUser.email || dto.title;
    if (!dto.avatar) dto.avatar = directUser.imageUrl || '';
  }
  return dto;
}

async function buildConversationDto(conversation, participant, actorUserId, extras = {}) {
  const participants = await participantRepository.listActiveByConversationId(conversation._id);
  const dto = toConversationDto(conversation, participant, {
    memberIds: participants.map((row) => String(row.userId)),
    ...extras,
  });
  return enrichDirectConversation(dto, actorUserId);
}

async function createDirect(actorUserId, actorName, recipientUserId) {
  const recipientId = assertObjectId(recipientUserId, 'recipientUserId');
  if (String(recipientId) === String(actorUserId)) {
    throw new AppError('Cannot start a direct conversation with yourself', {
      status: 400,
      code: converseErrorCodes.CONVERSE_DIRECT_SELF,
    });
  }

  const recipient = await userRepository.findById(recipientId);
  if (!recipient || recipient.status !== 'active') {
    throw new AppError('Recipient not found', {
      status: 404,
      code: converseErrorCodes.CONVERSE_NOT_FOUND,
    });
  }

  const directKey = makeDirectKey(actorUserId, recipientId);
  const existing = await conversationRepository.findDirectByKey(directKey);
  if (existing) {
    const membership = await participantRepository.findMembership(existing._id, actorUserId);
    const dto = await buildConversationDto(existing, membership, actorUserId);
    return { conversation: dto, created: false };
  }

  const conversation = await conversationRepository.createConversation({
    type: CONVERSATION_TYPES.DIRECT,
    directKey,
    memberCount: 2,
    createdBy: actorUserId,
  });

  await participantRepository.createParticipants([
    { conversationId: conversation._id, userId: actorUserId, role: MEMBER_ROLES.MEMBER, joinedAt: new Date() },
    { conversationId: conversation._id, userId: recipientId, role: MEMBER_ROLES.MEMBER, joinedAt: new Date() },
  ]);

  const membership = await participantRepository.findActiveMembership(conversation._id, actorUserId);
  const dto = await buildConversationDto(conversation, membership, actorUserId);
  return { conversation: dto, created: true };
}

async function createGroup(actorUserId, title, memberIds = []) {
  const sanitizedTitle = sanitizeText(title, MAX_GROUP_TITLE_LENGTH);
  if (!sanitizedTitle) {
    throw new AppError('Group title is required', {
      status: 400,
      code: converseErrorCodes.CONVERSE_INVALID_REQUEST,
    });
  }

  const uniqueMemberIds = [...new Set([String(actorUserId), ...memberIds.map(String)])];
  if (uniqueMemberIds.length < MIN_GROUP_PARTICIPANTS) {
    throw new AppError('Group must have at least two participants', {
      status: 400,
      code: converseErrorCodes.CONVERSE_GROUP_TOO_SMALL,
    });
  }

  const conversation = await conversationRepository.createConversation({
    type: CONVERSATION_TYPES.GROUP,
    title: sanitizedTitle,
    memberCount: uniqueMemberIds.length,
    adminUserIds: [actorUserId],
    createdBy: actorUserId,
  });

  await participantRepository.createParticipants(uniqueMemberIds.map((userId) => ({
    conversationId: conversation._id,
    userId,
    role: String(userId) === String(actorUserId) ? MEMBER_ROLES.OWNER : MEMBER_ROLES.MEMBER,
    joinedAt: new Date(),
  })));

  const membership = await participantRepository.findActiveMembership(conversation._id, actorUserId);
  const dto = await buildConversationDto(conversation, membership, actorUserId);
  return { conversation: dto, created: true };
}

async function listConversations(actorUserId) {
  const memberships = await participantRepository.listActiveByUserId(actorUserId);
  if (!memberships.length) return [];

  const conversationIds = memberships.map((row) => row.conversationId);
  const conversations = await Promise.all(conversationIds.map((id) => conversationRepository.findById(id)));
  const membershipByConversation = new Map(memberships.map((row) => [String(row.conversationId), row]));

  const rows = conversations
    .filter(Boolean)
    .map((conversation) => {
      const membership = membershipByConversation.get(String(conversation._id));
      return toConversationDto(conversation, membership, {
        memberIds: [],
      });
    });

  const enriched = await Promise.all(rows.map((row) => enrichDirectConversation(row, actorUserId)));

  enriched.sort((a, b) => {
    if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return Number(b.isPinned) - Number(a.isPinned);
    const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return enriched;
}

async function getConversation(conversationId, actorUserId) {
  const id = assertObjectId(conversationId, 'conversationId');
  const conversation = await conversationRepository.findById(id);
  if (!conversation) {
    throw new AppError('Conversation not found', {
      status: 404,
      code: converseErrorCodes.CONVERSE_NOT_FOUND,
    });
  }
  const membership = await getActiveParticipantOrThrow(id, actorUserId);
  const participants = await participantRepository.listActiveByConversationId(id);
  const userMap = await resolveUsersMap(participants.map((row) => row.userId));
  const members = participants.map((row) => ({
    ...userMap.get(String(row.userId)),
    role: row.role,
  }));
  return buildConversationDto(conversation, membership, actorUserId, { members });
}

async function listMessages(conversationId, actorUserId, query = {}) {
  const id = assertObjectId(conversationId, 'conversationId');
  await getActiveParticipantOrThrow(id, actorUserId);

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 40));
  const skip = (page - 1) * limit;

  const { items, total } = await messageRepository.listByConversation(id, actorUserId, { skip, limit });
  const senderMap = await resolveUsersMap(items.map((row) => row.senderId));

  return {
    data: items.map((row) => toMessageDto(row, senderMap.get(String(row.senderId))?.displayName || '')),
    meta: {
      page,
      limit,
      total,
      hasNextPage: skip + items.length < total,
    },
  };
}

async function sendMessage(actorUserId, actorName, conversationId, payload = {}) {
  const id = assertObjectId(conversationId, 'conversationId');
  await getActiveParticipantOrThrow(id, actorUserId);

  const text = payload.text ? sanitizeText(payload.text) : '';
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (!text && !attachments.length) {
    throw new AppError('Message must contain text or attachments', {
      status: 422,
      code: converseErrorCodes.CONVERSE_INVALID_REQUEST,
    });
  }

  const sequence = await messageRepository.nextSequence(id);
  const msgType = attachments.length ? MESSAGE_TYPES.FILE : MESSAGE_TYPES.TEXT;

  const message = await messageRepository.createMessage({
    conversationId: id,
    senderId: actorUserId,
    sequence,
    type: msgType,
    text,
    attachments,
    readBy: [{ userId: actorUserId, readAt: new Date() }],
  });

  const lastMessage = {
    messageId: message._id,
    text,
    type: msgType,
    senderId: actorUserId,
    senderName: actorName,
    createdAt: message.createdAt,
  };

  await conversationRepository.updateConversation(id, { lastMessage });
  await participantRepository.incrementUnreadForOthers(id, actorUserId);

  const dto = toMessageDto(message, actorName);
  const participants = await participantRepository.listActiveByConversationId(id);

  emitConverseMessageDelivered(id, dto, participants);
  return dto;
}

async function markConversationRead(conversationId, actorUserId, payload = {}) {
  const id = assertObjectId(conversationId, 'conversationId');
  await getActiveParticipantOrThrow(id, actorUserId);

  const now = new Date();
  let messageId = payload.messageId || payload.lastReadMessageId || null;

  if (!messageId) {
    const conversation = await conversationRepository.findById(id);
    messageId = conversation?.lastMessage?.messageId || null;
  }

  await participantRepository.updateParticipant(id, actorUserId, {
    unreadCount: 0,
    mentionCount: 0,
    lastReadAt: now,
    ...(messageId ? { lastReadMessageId: messageId } : {}),
  });

  if (messageId) {
    await messageRepository.pushReadReceipt(messageId, actorUserId, now);
    emitConverseMessageRead(id, {
      conversationId: String(id),
      messageId: String(messageId),
      userId: String(actorUserId),
      readAt: now,
    });
  }

  emitConverseUnreadUpdated(actorUserId, {
    conversationId: String(id),
    unreadCount: 0,
    lastReadMessageId: messageId ? String(messageId) : null,
  });

  return { read: true, conversationId: String(id), messageId: messageId ? String(messageId) : null };
}

async function addParticipants(conversationId, actorUserId, memberIds = []) {
  const id = assertObjectId(conversationId, 'conversationId');
  const membership = await getActiveParticipantOrThrow(id, actorUserId);
  assertCanManageParticipants(membership);

  const conversation = await conversationRepository.findById(id);
  if (!conversation || conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw new AppError('Participants can only be added to group conversations', {
      status: 400,
      code: converseErrorCodes.CONVERSE_INVALID_REQUEST,
    });
  }

  const uniqueIds = [...new Set(memberIds.map(String).filter(Boolean))];
  for (const userId of uniqueIds) {
    const existing = await participantRepository.findMembership(id, userId);
    if (existing?.leftAt) {
      await participantRepository.updateParticipant(id, userId, {
        leftAt: null,
        isDeletedForMe: false,
        joinedAt: new Date(),
        unreadCount: 0,
      });
    } else if (!existing) {
      await participantRepository.createParticipants([{
        conversationId: id,
        userId,
        role: MEMBER_ROLES.MEMBER,
        joinedAt: new Date(),
      }]);
    }
  }

  const participants = await participantRepository.listActiveByConversationId(id);
  await conversationRepository.updateConversation(id, {
    memberCount: participants.length,
  });

  const dto = await getConversation(id, actorUserId);
  emitConverseConversationUpdated(id, dto);
  return dto;
}

async function removeParticipant(conversationId, actorUserId, targetUserId) {
  const id = assertObjectId(conversationId, 'conversationId');
  const targetId = assertObjectId(targetUserId, 'userId');
  const membership = await getActiveParticipantOrThrow(id, actorUserId);
  assertCanManageParticipants(membership);

  const targetMembership = await participantRepository.findActiveMembership(id, targetId);
  if (!targetMembership) {
    throw new AppError('Participant not found', {
      status: 404,
      code: converseErrorCodes.CONVERSE_PARTICIPANT_NOT_FOUND,
    });
  }

  if (targetMembership.role === MEMBER_ROLES.OWNER) {
    throw new AppError('Cannot remove the group owner', {
      status: 409,
      code: converseErrorCodes.CONVERSE_FORBIDDEN,
    });
  }

  await participantRepository.updateParticipant(id, targetId, {
    leftAt: new Date(),
    unreadCount: 0,
  });

  const participants = await participantRepository.listActiveByConversationId(id);
  await conversationRepository.updateConversation(id, {
    memberCount: participants.length,
    adminUserIds: participants
      .filter((row) => [MEMBER_ROLES.OWNER, MEMBER_ROLES.ADMIN].includes(row.role))
      .map((row) => row.userId),
  });

  return { removed: true, userId: String(targetId) };
}

async function leaveConversation(conversationId, actorUserId) {
  const id = assertObjectId(conversationId, 'conversationId');
  const membership = await getActiveParticipantOrThrow(id, actorUserId);

  if (membership.role === MEMBER_ROLES.OWNER) {
    throw new AppError('Transfer ownership before leaving the group', {
      status: 409,
      code: converseErrorCodes.CONVERSE_FORBIDDEN,
    });
  }

  await participantRepository.updateParticipant(id, actorUserId, {
    leftAt: new Date(),
    unreadCount: 0,
  });

  const participants = await participantRepository.listActiveByConversationId(id);
  await conversationRepository.updateConversation(id, { memberCount: participants.length });
  return { left: true };
}

async function updateGroupTitle(conversationId, actorUserId, title) {
  const id = assertObjectId(conversationId, 'conversationId');
  const membership = await getActiveParticipantOrThrow(id, actorUserId);
  assertCanManageParticipants(membership);

  const sanitizedTitle = sanitizeText(title, MAX_GROUP_TITLE_LENGTH);
  const updated = await conversationRepository.updateConversation(id, { title: sanitizedTitle });
  const dto = await buildConversationDto(updated, membership, actorUserId);
  emitConverseConversationUpdated(id, dto);
  return dto;
}

async function updateParticipantSettings(conversationId, actorUserId, settings = {}) {
  const id = assertObjectId(conversationId, 'conversationId');
  await getActiveParticipantOrThrow(id, actorUserId);

  const updates = {};
  if (settings.isPinned !== undefined) updates.isPinned = Boolean(settings.isPinned);
  if (settings.isMuted !== undefined) updates.isMuted = Boolean(settings.isMuted);

  const membership = await participantRepository.updateParticipant(id, actorUserId, updates);
  const conversation = await conversationRepository.findById(id);
  return buildConversationDto(conversation, membership, actorUserId);
}

async function editMessage(conversationId, messageId, actorUserId, text) {
  const id = assertObjectId(conversationId, 'conversationId');
  const mid = assertObjectId(messageId, 'messageId');
  await getActiveParticipantOrThrow(id, actorUserId);

  const message = await messageRepository.findById(mid);
  if (!message || String(message.conversationId) !== String(id)) {
    throw new AppError('Message not found', {
      status: 404,
      code: converseErrorCodes.CONVERSE_MESSAGE_NOT_FOUND,
    });
  }
  if (String(message.senderId) !== String(actorUserId)) {
    throw new AppError('Only the sender can edit this message', {
      status: 403,
      code: converseErrorCodes.CONVERSE_FORBIDDEN,
    });
  }

  const sanitized = sanitizeText(text);
  const updated = await messageRepository.updateMessage(mid, {
    text: sanitized,
    isEdited: true,
    editedAt: new Date(),
  });

  const users = await resolveUsersMap([actorUserId]);
  return toMessageDto(updated, users.get(String(actorUserId))?.displayName || '');
}

async function deleteMessageForEveryone(conversationId, messageId, actorUserId) {
  const id = assertObjectId(conversationId, 'conversationId');
  const mid = assertObjectId(messageId, 'messageId');
  await getActiveParticipantOrThrow(id, actorUserId);

  const message = await messageRepository.findById(mid);
  if (!message || String(message.conversationId) !== String(id)) {
    throw new AppError('Message not found', {
      status: 404,
      code: converseErrorCodes.CONVERSE_MESSAGE_NOT_FOUND,
    });
  }
  if (String(message.senderId) !== String(actorUserId)) {
    throw new AppError('Only the sender can delete this message', {
      status: 403,
      code: converseErrorCodes.CONVERSE_FORBIDDEN,
    });
  }

  const updated = await messageRepository.updateMessage(mid, {
    isDeletedForEveryone: true,
    deletedAt: new Date(),
    deletedBy: actorUserId,
    text: '',
  });

  const users = await resolveUsersMap([actorUserId]);
  return toMessageDto(updated, users.get(String(actorUserId))?.displayName || '');
}

async function getUnreadCount(actorUserId) {
  const total = await participantRepository.sumUnreadForUser(actorUserId);
  return { total };
}

async function searchUsers(query, actorUserId) {
  const result = await userRepository.listUsers(
    { search: query, status: 'active' },
    { limit: 20 }
  );
  return (result.items || [])
    .filter((user) => String(user._id) !== String(actorUserId))
    .map(toUserSummaryDto);
}

function getOnlineUserIds() {
  return presenceService.getOnlineUserIds();
}

function getConfig() {
  return { enabled: true, attachments: true, typing: true, groups: true };
}

async function handleTyping(conversationId, actorUserId, actorName, isTyping) {
  const id = assertObjectId(conversationId, 'conversationId');
  await getActiveParticipantOrThrow(id, actorUserId);
  if (isTyping) {
    emitConverseTypingStarted(id, actorUserId, actorName);
  } else {
    emitConverseTypingStopped(id, actorUserId, actorName);
  }
}

async function assertConversationParticipant(conversationId, userId) {
  return getActiveParticipantOrThrow(conversationId, userId);
}

module.exports = {
  createDirect,
  createGroup,
  listConversations,
  getConversation,
  listMessages,
  sendMessage,
  markConversationRead,
  addParticipants,
  removeParticipant,
  leaveConversation,
  updateGroupTitle,
  updateParticipantSettings,
  editMessage,
  deleteMessageForEveryone,
  getUnreadCount,
  searchUsers,
  getOnlineUserIds,
  getConfig,
  handleTyping,
  assertConversationParticipant,
};
