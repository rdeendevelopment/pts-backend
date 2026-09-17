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
  ADMIN_ROLES,
} = require('../constants/converse.constants');
const converseErrorCodes = require('../errors/converseErrorCodes');
const { makeDirectKey } = require('../helpers/directKey.helper');
const { sanitizeText } = require('../helpers/sanitizeText.helper');
const { getAuthorizedMembership, assertProjectAccess, assertCanManageParticipants } = require('../helpers/access.helper');
const {
  emitConverseMessageDelivered,
  emitConverseConversationUpdated,
  emitConverseMessageRead,
  emitConverseUnreadUpdated,
  emitConverseTypingStarted,
  emitConverseTypingStopped,
  emitConverseConversationAvailable,
  emitConverseMessageUpdated,
  emitConverseMessageDeleted,
  emitConverseMembershipUpdated,
  evictConverseUserFromRoom,
} = require('../../socket/helpers/converseSocketEvents.helper');
const conversationRepository = require('../repositories/conversation.repository');
const participantRepository = require('../repositories/participant.repository');
const messageRepository = require('../repositories/message.repository');
const { toConversationDto, toMessageDto, toUserSummaryDto } = require('../dto/converse.dto');
const converseNotificationService = require('./converseNotification.service');

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
  const participants = await authorizedRecipients(conversation);
  const dto = toConversationDto(conversation, participant, {
    memberIds: participants.map((row) => String(row.userId)),
    ...extras,
  });
  if (conversation.type === CONVERSATION_TYPES.PROJECT) dto.memberCount = participants.length;
  return enrichDirectConversation(dto, actorUserId);
}

async function authorizedRecipients(conversation) {
  const participants = await participantRepository.listActiveByConversationId(conversation._id);
  if (conversation.type !== CONVERSATION_TYPES.PROJECT) return participants;
  const allowed = [];
  for (const participant of participants) {
    try {
      await assertProjectAccess(conversation.projectId, participant.userId);
      allowed.push(participant);
    } catch (_error) {
      // A stale project-room participant cannot receive project messages.
    }
  }
  return allowed;
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
  let conversation = await conversationRepository.findDirectByKey(directKey);
  let created = false;
  if (!conversation) {
    try {
      conversation = await conversationRepository.createConversation({
        type: CONVERSATION_TYPES.DIRECT,
        directKey,
        memberCount: 2,
        createdBy: actorUserId,
      });
      created = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      conversation = await conversationRepository.findDirectByKey(directKey);
      if (!conversation) throw error;
    }
  }

  await Promise.all([
    participantRepository.ensureParticipant(conversation._id, actorUserId),
    participantRepository.ensureParticipant(conversation._id, recipientId),
  ]);

  const membership = await participantRepository.findActiveMembership(conversation._id, actorUserId);
  const dto = await buildConversationDto(conversation, membership, actorUserId);
  if (created) {
    const recipientMembership = await participantRepository.findActiveMembership(conversation._id, recipientId);
    const recipientDto = await buildConversationDto(conversation, recipientMembership, recipientId);
    emitConverseConversationAvailable(recipientId, recipientDto);
  }
  return { conversation: dto, created };
}

async function createProjectRoom(actorUserId, projectId, auth = null) {
  const id = assertObjectId(projectId, 'projectId');
  await assertProjectAccess(id, actorUserId, auth);
  let conversation = await conversationRepository.findProjectById(id);
  let created = false;
  if (!conversation) {
    const project = await require('../../projects').getProjectForActivity(id);
    try {
      conversation = await conversationRepository.createConversation({
        type: CONVERSATION_TYPES.PROJECT,
        projectId: id,
        title: project.name,
        createdBy: actorUserId,
      });
      created = true;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      conversation = await conversationRepository.findProjectById(id);
      if (!conversation) throw error;
    }
  }
  const membership = await participantRepository.ensureParticipant(conversation._id, actorUserId);
  return { conversation: await buildConversationDto(conversation, membership, actorUserId), created };
}

async function createGroup(actorUserId, title, memberIds = [], avatar = null) {
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

  for (const userId of uniqueMemberIds) {
    const member = await userRepository.findById(assertObjectId(userId, 'memberId'));
    if (!member || member.status !== 'active') {
      throw new AppError('Group member not found', { status: 404, code: converseErrorCodes.CONVERSE_NOT_FOUND });
    }
  }

  const conversation = await conversationRepository.createConversation({
    type: CONVERSATION_TYPES.GROUP,
    title: sanitizedTitle,
    avatar: avatar ? String(avatar).trim().slice(0, 2048) : null,
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
  for (const userId of uniqueMemberIds) {
    if (userId !== String(actorUserId)) {
      const participant = await participantRepository.findActiveMembership(conversation._id, userId);
      emitConverseConversationAvailable(userId, await buildConversationDto(conversation, participant, userId));
    }
  }
  return { conversation: dto, created: true };
}

async function listConversations(actorUserId, auth = null) {
  const memberships = await participantRepository.listActiveByUserId(actorUserId);
  if (!memberships.length) return [];

  const conversationIds = memberships.map((row) => row.conversationId);
  const conversations = await Promise.all(conversationIds.map((id) => conversationRepository.findById(id)));
  const membershipByConversation = new Map(memberships.map((row) => [String(row.conversationId), row]));

  const visible = [];
  for (const conversation of conversations.filter(Boolean)) {
    if (conversation.type === CONVERSATION_TYPES.PROJECT) {
      try {
        await assertProjectAccess(conversation.projectId, actorUserId, auth);
      } catch (_error) {
        continue;
      }
    }
    visible.push(conversation);
  }

  const rows = await Promise.all(visible.map(async (conversation) => {
    const membership = membershipByConversation.get(String(conversation._id));
    const participants = conversation.type === CONVERSATION_TYPES.PROJECT
      ? await authorizedRecipients(conversation)
      : conversation.type === CONVERSATION_TYPES.DIRECT
        ? await participantRepository.listActiveByConversationId(conversation._id)
        : [];
    const dto = toConversationDto(conversation, membership, {
      memberIds: participants.map((row) => String(row.userId)),
    });
    if (conversation.type === CONVERSATION_TYPES.PROJECT) dto.memberCount = participants.length;
    return dto;
  }));

  const enriched = await Promise.all(rows.map((row) => enrichDirectConversation(row, actorUserId)));

  enriched.sort((a, b) => {
    if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return Number(b.isPinned) - Number(a.isPinned);
    const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return enriched;
}

async function getConversation(conversationId, actorUserId, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  const conversation = await conversationRepository.findById(id);
  if (!conversation) {
    throw new AppError('Conversation not found', {
      status: 404,
      code: converseErrorCodes.CONVERSE_NOT_FOUND,
    });
  }
  const membership = await getAuthorizedMembership(id, actorUserId, auth);
  const participants = await authorizedRecipients(conversation);
  const userMap = await resolveUsersMap(participants.map((row) => row.userId));
  const members = participants.map((row) => ({
    ...userMap.get(String(row.userId)),
    role: row.role,
  }));
  return buildConversationDto(conversation, membership, actorUserId, { members });
}

async function listMessages(conversationId, actorUserId, query = {}, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  await getAuthorizedMembership(id, actorUserId, auth);

  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 40));
  let beforeCursor = null;
  if (query.before !== undefined) {
    const match = String(query.before).match(/^([1-9]\d*):([a-f\d]{24})$/i);
    const sequence = Number(match?.[1]);
    if (!match || !Number.isSafeInteger(sequence)) {
      throw new AppError('Invalid message cursor', { status: 400, code: converseErrorCodes.CONVERSE_INVALID_REQUEST });
    }
    beforeCursor = { sequence, messageId: assertObjectId(match[2], 'messageId') };
  }

  const { items, hasMore, nextCursor } = await messageRepository.listByConversation(id, actorUserId, { beforeCursor, limit });
  const senderMap = await resolveUsersMap(items.map((row) => row.senderId));

  return {
    data: items.map((row) => toMessageDto(row, senderMap.get(String(row.senderId))?.displayName || '')),
    meta: {
      limit,
      hasNextPage: hasMore,
      nextCursor,
    },
  };
}

async function sendMessage(actorUserId, actorName, conversationId, payload = {}, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  const membership = await getAuthorizedMembership(id, actorUserId, auth);
  const conversationBeforeSend = await conversationRepository.findById(id);

  // Check for idempotency: if clientMessageId provided and message exists, return existing
  const clientMessageId = payload.clientMessageId ? String(payload.clientMessageId).trim() : null;
  if (clientMessageId) {
    const existing = await messageRepository.findByClientMessageId(id, actorUserId, clientMessageId);
    if (existing) {
      const senders = await resolveUsersMap([existing.senderId]);
      return toMessageDto(existing, senders.get(String(existing.senderId))?.displayName || actorName);
    }
  }

  const text = payload.text ? sanitizeText(payload.text) : '';
  const attachments = (Array.isArray(payload.attachments) ? payload.attachments : []).map((attachment) => {
    const storageKey = String(attachment.storageKey || attachment.url || attachment.fileUrl || '');
    if (!storageKey.startsWith('/uploads/')) {
      throw new AppError('Invalid attachment storage reference', {
        status: 422, code: converseErrorCodes.CONVERSE_INVALID_REQUEST,
      });
    }
    const mimeType = String(attachment.mimeType || attachment.fileType || '');
    const inferredCategory = mimeType.startsWith('image/') ? 'image'
      : mimeType.startsWith('audio/') ? 'audio'
      : mimeType === 'application/pdf' ? 'pdf'
      : mimeType.includes('spreadsheet') || mimeType.includes('excel') ? 'spreadsheet'
      : mimeType.includes('word') ? 'document' : 'other';
    const category = attachment.category === 'voice-note' ? 'voice' : String(attachment.category || inferredCategory);
    return {
      fileName: String(attachment.fileName || 'Attachment').slice(0, 255),
      fileUrl: storageKey,
      url: storageKey,
      storageKey,
      fileType: mimeType || null,
      mimeType: mimeType || null,
      fileSize: Number(attachment.fileSize || attachment.size || 0) || null,
      size: Number(attachment.size || attachment.fileSize || 0) || null,
      category,
      duration: Number(attachment.duration || 0) || null,
    };
  });
  if (!text && !attachments.length) {
    throw new AppError('Message must contain text or attachments', {
      status: 422,
      code: converseErrorCodes.CONVERSE_INVALID_REQUEST,
    });
  }

  const mentions = [...new Set((Array.isArray(payload.mentions) ? payload.mentions : []).map((value) =>
    String(assertObjectId(value, 'mentionUserId'))))];
  if (mentions.length > 20) {
    throw new AppError('Too many mentions', { status: 422, code: converseErrorCodes.CONVERSE_INVALID_REQUEST });
  }
  for (const userId of mentions) {
    const mentionedUser = await userRepository.findById(userId);
    if (!mentionedUser || mentionedUser.status !== 'active') {
      throw new AppError('Mentioned user is unavailable', { status: 404, code: converseErrorCodes.CONVERSE_NOT_FOUND });
    }
  }
  const mentionAll = payload.mentionAll === true;
  if (mentionAll && (conversationBeforeSend?.type !== CONVERSATION_TYPES.GROUP || !ADMIN_ROLES.has(membership.role))) {
    throw new AppError('@all requires group admin access', { status: 403, code: converseErrorCodes.CONVERSE_FORBIDDEN });
  }
  if (conversationBeforeSend?.type === CONVERSATION_TYPES.PROJECT) {
    for (const userId of mentions) {
      await assertProjectAccess(conversationBeforeSend.projectId, userId);
      await participantRepository.ensureParticipant(id, userId);
    }
  } else if (mentions.length) {
    const allowedIds = new Set((await participantRepository.listActiveByConversationId(id)).map((row) => String(row.userId)));
    if (mentions.some((userId) => !allowedIds.has(userId))) {
      throw new AppError('Mentioned user is not in this conversation', {
        status: 403, code: converseErrorCodes.CONVERSE_FORBIDDEN,
      });
    }
  }

  let replyTo = null;
  if (payload.replyToMessageId) {
    const replyId = assertObjectId(payload.replyToMessageId, 'replyToMessageId');
    const original = await messageRepository.findById(replyId);
    if (!original || String(original.conversationId) !== String(id)) {
      throw new AppError('Reply message not found in conversation', {
        status: 404, code: converseErrorCodes.CONVERSE_MESSAGE_NOT_FOUND,
      });
    }
    const senders = await resolveUsersMap([original.senderId]);
    replyTo = {
      messageId: original._id,
      text: original.text || '',
      senderId: original.senderId,
      senderName: senders.get(String(original.senderId))?.displayName || '',
    };
  }

  const sequence = await messageRepository.nextSequence(id);
  if (!sequence) {
    throw new AppError('Conversation not found', { status: 404, code: converseErrorCodes.CONVERSE_NOT_FOUND });
  }
  const msgType = attachments.length ? MESSAGE_TYPES.FILE : MESSAGE_TYPES.TEXT;

  const message = await messageRepository.createMessage({
    conversationId: id,
    senderId: actorUserId,
    clientMessageId,
    sequence,
    type: msgType,
    text,
    replyTo,
    attachments,
    mentions,
    mentionAll,
    readBy: [{ userId: actorUserId, readAt: new Date() }],
    isForwarded: payload.isForwarded === true,
  });

  const lastMessage = {
    messageId: message._id,
    text,
    type: msgType,
    senderId: actorUserId,
    senderName: actorName,
    attachmentCategory: attachments[0]?.category || null,
    attachmentFileName: attachments[0]?.fileName || '',
    createdAt: message.createdAt,
  };

  const conversation = await conversationRepository.updateConversation(id, { lastMessage });
  const allowedParticipants = await authorizedRecipients(conversation);
  await participantRepository.incrementUnreadForOthers(id, actorUserId, allowedParticipants.map((row) => row.userId));
  const mentionTargets = new Set(mentions);
  if (mentionAll) allowedParticipants.forEach((row) => mentionTargets.add(String(row.userId)));
  mentionTargets.delete(String(actorUserId));
  await participantRepository.incrementMentions(id, [...mentionTargets]);

  const dto = toMessageDto(message, actorName);
  const participants = await participantRepository.listActiveByConversationId(id);
  emitConverseMessageDelivered(id, dto, participants.filter((row) =>
    allowedParticipants.some((allowed) => String(allowed.userId) === String(row.userId))
  ));
  await converseNotificationService.notifyForMessage({
    conversation,
    message,
    actorUserId,
    actorName,
    participants: allowedParticipants,
  });
  return dto;
}

async function forwardMessage(actorUserId, actorName, sourceConversationId, messageId, destinationConversationId, auth = null) {
  const sourceId = assertObjectId(sourceConversationId, 'conversationId');
  const mid = assertObjectId(messageId, 'messageId');
  const destinationId = assertObjectId(destinationConversationId, 'destinationConversationId');
  await getAuthorizedMembership(sourceId, actorUserId, auth);
  await getAuthorizedMembership(destinationId, actorUserId, auth);
  const original = await messageRepository.findById(mid);
  if (!original || String(original.conversationId) !== String(sourceId) || original.isDeletedForEveryone) {
    throw new AppError('Message not found', { status: 404, code: converseErrorCodes.CONVERSE_MESSAGE_NOT_FOUND });
  }
  const text = String(original.text || '');
  const attachments = (original.attachments || []).map((item) => item.toObject ? item.toObject() : { ...item });
  if (!text && !attachments.length) {
    throw new AppError('Message cannot be forwarded', { status: 422, code: converseErrorCodes.CONVERSE_INVALID_REQUEST });
  }
  return sendMessage(actorUserId, actorName, destinationId, { text, attachments, isForwarded: true }, auth);
}

async function toggleReaction(conversationId, messageId, actorUserId, emoji, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  const mid = assertObjectId(messageId, 'messageId');
  await getAuthorizedMembership(id, actorUserId, auth);
  const allowedEmoji = new Set(['👍', '❤️', '😂', '✅', '👀', '🎉']);
  if (!allowedEmoji.has(emoji)) {
    throw new AppError('Unsupported reaction', { status: 422, code: converseErrorCodes.CONVERSE_INVALID_REQUEST });
  }
  const existing = await messageRepository.findById(mid);
  if (!existing || String(existing.conversationId) !== String(id)) {
    throw new AppError('Message not found', { status: 404, code: converseErrorCodes.CONVERSE_MESSAGE_NOT_FOUND });
  }
  const updated = await messageRepository.toggleReaction(mid, actorUserId, emoji);
  const senders = await resolveUsersMap([updated.senderId]);
  const dto = toMessageDto(updated, senders.get(String(updated.senderId))?.displayName || '');
  emitConverseMessageUpdated(id, dto, await authorizedRecipients(await conversationRepository.findById(id)));
  return dto;
}

async function markConversationRead(conversationId, actorUserId, payload = {}, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  const membership = await getAuthorizedMembership(id, actorUserId, auth);

  const now = new Date();
  let messageId = payload.messageId || payload.lastReadMessageId || null;

  if (!messageId) {
    const conversation = await conversationRepository.findById(id);
    messageId = conversation?.lastMessage?.messageId || null;
  }

  let readSequence = Number(membership.lastReadSequence || 0);
  if (messageId) {
    const message = await messageRepository.findAnyById(assertObjectId(messageId, 'messageId'));
    if (!message || String(message.conversationId) !== String(id)) {
      throw new AppError('Message not found in conversation', { status: 404, code: converseErrorCodes.CONVERSE_MESSAGE_NOT_FOUND });
    }
    readSequence = Math.max(readSequence, Number(message.sequence || 0));
  }
  const unreadCount = await messageRepository.countUnreadAfter(id, actorUserId, readSequence);
  await participantRepository.updateParticipant(id, actorUserId, {
    unreadCount,
    mentionCount: 0,
    lastReadAt: now,
    lastReadSequence: readSequence,
    ...(messageId ? { lastReadMessageId: messageId } : {}),
  });

  if (messageId) {
    await messageRepository.pushReadReceipt(messageId, actorUserId, now);
    const conversation = await conversationRepository.findById(id);
    emitConverseMessageRead(id, {
      conversationId: String(id),
      messageId: String(messageId),
      userId: String(actorUserId),
      readAt: now,
    }, await authorizedRecipients(conversation));
  }

  emitConverseUnreadUpdated(actorUserId, {
    conversationId: String(id),
    unreadCount,
    lastReadMessageId: messageId ? String(messageId) : null,
  });

  return { read: true, conversationId: String(id), messageId: messageId ? String(messageId) : null, unreadCount };
}

async function addParticipants(conversationId, actorUserId, memberIds = []) {
  const id = assertObjectId(conversationId, 'conversationId');
  const membership = await getAuthorizedMembership(id, actorUserId);
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
    const user = await userRepository.findById(assertObjectId(userId, 'memberId'));
    if (!user || user.status !== 'active') {
      throw new AppError('Group member not found', { status: 404, code: converseErrorCodes.CONVERSE_NOT_FOUND });
    }
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
  emitConverseMembershipUpdated(id, { conversationId: String(id), memberIds: dto.memberIds });
  for (const userId of uniqueIds) {
    const participant = await participantRepository.findActiveMembership(id, userId);
    if (participant) emitConverseConversationAvailable(userId, await buildConversationDto(conversation, participant, userId));
  }
  return dto;
}

async function removeParticipant(conversationId, actorUserId, targetUserId) {
  const id = assertObjectId(conversationId, 'conversationId');
  const targetId = assertObjectId(targetUserId, 'userId');
  const membership = await getAuthorizedMembership(id, actorUserId);
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
  if (targetMembership.role === MEMBER_ROLES.ADMIN && membership.role !== MEMBER_ROLES.OWNER) {
    throw new AppError('Only the group owner can remove an admin', {
      status: 403, code: converseErrorCodes.CONVERSE_FORBIDDEN,
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

  evictConverseUserFromRoom(id, targetId);
  emitConverseMembershipUpdated(id, { conversationId: String(id), removedUserId: String(targetId) });
  emitConverseMembershipUpdated(null, { conversationId: String(id), removedUserId: String(targetId) }, targetId);

  return { removed: true, userId: String(targetId) };
}

async function leaveConversation(conversationId, actorUserId) {
  const id = assertObjectId(conversationId, 'conversationId');
  const conversation = await conversationRepository.findById(id);
  if (!conversation || conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw new AppError('Only group members can leave a group', { status: 400, code: converseErrorCodes.CONVERSE_INVALID_REQUEST });
  }
  const membership = await getAuthorizedMembership(id, actorUserId);

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
  evictConverseUserFromRoom(id, actorUserId);
  emitConverseMembershipUpdated(id, { conversationId: String(id), removedUserId: String(actorUserId) });
  emitConverseMembershipUpdated(null, { conversationId: String(id), removedUserId: String(actorUserId) }, actorUserId);
  return { left: true };
}

async function updateGroupTitle(conversationId, actorUserId, title) {
  const id = assertObjectId(conversationId, 'conversationId');
  const conversation = await conversationRepository.findById(id);
  if (!conversation || conversation.type !== CONVERSATION_TYPES.GROUP) {
    throw new AppError('Only groups can be renamed', { status: 400, code: converseErrorCodes.CONVERSE_INVALID_REQUEST });
  }
  const membership = await getAuthorizedMembership(id, actorUserId);
  assertCanManageParticipants(membership);

  const sanitizedTitle = sanitizeText(title, MAX_GROUP_TITLE_LENGTH);
  if (!sanitizedTitle) {
    throw new AppError('Group title is required', { status: 400, code: converseErrorCodes.CONVERSE_INVALID_REQUEST });
  }
  const updated = await conversationRepository.updateConversation(id, { title: sanitizedTitle });
  const dto = await buildConversationDto(updated, membership, actorUserId);
  emitConverseConversationUpdated(id, dto);
  return dto;
}

async function updateParticipantSettings(conversationId, actorUserId, settings = {}, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  await getAuthorizedMembership(id, actorUserId, auth);

  const updates = {};
  if (settings.isPinned !== undefined) updates.isPinned = Boolean(settings.isPinned);
  if (settings.isMuted !== undefined) updates.isMuted = Boolean(settings.isMuted);

  const membership = await participantRepository.updateParticipant(id, actorUserId, updates);
  const conversation = await conversationRepository.findById(id);
  return buildConversationDto(conversation, membership, actorUserId);
}

async function editMessage(conversationId, messageId, actorUserId, text, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  const mid = assertObjectId(messageId, 'messageId');
  await getAuthorizedMembership(id, actorUserId, auth);

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
  const dto = toMessageDto(updated, users.get(String(actorUserId))?.displayName || '');
  emitConverseMessageUpdated(id, dto, await authorizedRecipients(await conversationRepository.findById(id)));
  return dto;
}

async function deleteMessageForEveryone(conversationId, messageId, actorUserId, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  const mid = assertObjectId(messageId, 'messageId');
  await getAuthorizedMembership(id, actorUserId, auth);

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
  const dto = toMessageDto(updated, users.get(String(actorUserId))?.displayName || '');
  emitConverseMessageDeleted(id, dto, await authorizedRecipients(await conversationRepository.findById(id)));
  return dto;
}

async function getUnreadCount(actorUserId, auth = null) {
  const conversations = await listConversations(actorUserId, auth);
  const total = conversations.reduce((sum, row) => sum + Number(row.unreadCount || 0), 0);
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

async function listTeamMembers(actorUserId, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 100));
  const result = await userRepository.listUsersPage(
    { search: query.q || '', status: 'active' },
    { limit, skip: (page - 1) * limit, sort: { displayName: 1, _id: 1 } }
  );
  return {
    items: result.items.filter((user) => String(user._id) !== String(actorUserId)).map(toUserSummaryDto),
    page,
    hasMore: page * limit < result.total,
  };
}

function getOnlineUserIds() {
  return presenceService.getOnlineUserIds();
}

function getConfig() {
  return { enabled: true, attachments: true, typing: true, groups: true };
}

async function handleTyping(conversationId, actorUserId, actorName, isTyping, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  await getAuthorizedMembership(id, actorUserId, auth);
  const recipients = await authorizedRecipients(await conversationRepository.findById(id));
  if (isTyping) {
    emitConverseTypingStarted(id, actorUserId, actorName, recipients);
  } else {
    emitConverseTypingStopped(id, actorUserId, actorName, recipients);
  }
}

async function handleMessageDeliveryAck(conversationId, messageId, recipientUserId, auth = null) {
  const id = assertObjectId(conversationId, 'conversationId');
  const mid = assertObjectId(messageId, 'messageId');
  await getAuthorizedMembership(id, recipientUserId, auth);
  const message = await messageRepository.findById(mid);
  if (!message || String(message.conversationId) !== String(id)) {
    throw new AppError('Message not found', { status: 404, code: converseErrorCodes.CONVERSE_MESSAGE_NOT_FOUND });
  }
  await messageRepository.pushDeliveryReceipt(mid, recipientUserId);
  const { emitConverseDeliveryAcknowledgement } = require('../../socket/helpers/converseSocketEvents.helper');
  emitConverseDeliveryAcknowledgement(String(message.senderId), String(id), String(mid));
}

async function assertConversationParticipant(conversationId, userId, auth = null) {
  return getAuthorizedMembership(conversationId, userId, auth);
}

async function downloadAttachment(conversationId, messageId, attachmentIndex, userId, auth = null, res) {
  const path = require('path');
  const fs = require('fs');
  const uploadDirectory = path.resolve('src/storage/uploads');

  const cid = assertObjectId(conversationId, 'conversationId');
  const mid = assertObjectId(messageId, 'messageId');

  await getAuthorizedMembership(cid, userId, auth);

  const message = await messageRepository.findById(mid);
  if (!message || String(message.conversationId) !== String(cid)) {
    throw new AppError('Message not found', { status: 404, code: converseErrorCodes.CONVERSE_MESSAGE_NOT_FOUND });
  }

  const attachments = message.attachments || [];
  if (attachmentIndex < 0 || attachmentIndex >= attachments.length) {
    throw new AppError('Attachment not found', { status: 404 });
  }

  const attachment = attachments[attachmentIndex];
  const storagePath = attachment.storageKey || attachment.url || '';
  if (!storagePath) {
    throw new AppError('Attachment has no storage path', { status: 404 });
  }

  const filename = storagePath.startsWith('/uploads/') ? storagePath.slice(8) : storagePath.split('/').pop();
  const safeFileName = path.basename(filename);
  const fullPath = path.join(uploadDirectory, safeFileName);

  if (!fullPath.startsWith(uploadDirectory)) {
    throw new AppError('Invalid file path', { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    throw new AppError('File not found', { status: 404 });
  }

  const extension = path.extname(safeFileName).slice(1).toLowerCase();
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx', 'txt', 'xlsx', 'mp4', 'webm', 'ogv', 'mov', 'm4a', 'wav', 'ogg', 'flac'];

  if (!allowedExtensions.includes(extension)) {
    throw new AppError('File type not allowed for download', { status: 403 });
  }

  const stat = fs.statSync(fullPath);
  const mimeType = attachment.mimeType || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);

  const fileStream = fs.createReadStream(fullPath);
  fileStream.pipe(res);

  return new Promise((resolve, reject) => {
    fileStream.on('end', () => resolve());
    fileStream.on('error', reject);
    res.on('error', reject);
  });
}

async function saveMessage(messageId, conversationId, userId, auth = null) {
  const mid = assertObjectId(messageId, 'messageId');
  const cid = assertObjectId(conversationId, 'conversationId');
  await getAuthorizedMembership(cid, userId, auth);

  const message = await messageRepository.findById(mid);
  if (!message || String(message.conversationId) !== String(cid)) {
    throw new AppError('Message not found', { status: 404 });
  }

  const SavedMessage = require('../models/saved-message.model').getSavedMessageModel();
  const saved = await SavedMessage.findOneAndUpdate(
    { userId, messageId: mid },
    { userId, messageId: mid, conversationId: cid },
    { upsert: true, new: true }
  );
  return { saved: true, _id: String(saved._id) };
}

async function unsaveMessage(messageId, userId) {
  const mid = assertObjectId(messageId, 'messageId');
  const SavedMessage = require('../models/saved-message.model').getSavedMessageModel();
  await SavedMessage.deleteOne({ userId, messageId: mid });
  return { unsaved: true };
}

async function pinMessage(messageId, conversationId, userId, auth = null) {
  const mid = assertObjectId(messageId, 'messageId');
  const cid = assertObjectId(conversationId, 'conversationId');
  await getAuthorizedMembership(cid, userId, auth);

  const message = await messageRepository.findById(mid);
  if (!message || String(message.conversationId) !== String(cid)) {
    throw new AppError('Message not found', { status: 404 });
  }

  const PinnedMessage = require('../models/pinned-message.model').getPinnedMessageModel();
  const pinned = await PinnedMessage.findOneAndUpdate(
    { conversationId: cid, messageId: mid },
    { conversationId: cid, messageId: mid, pinnedBy: userId },
    { upsert: true, new: true }
  );
  return { pinned: true, _id: String(pinned._id) };
}

async function unpinMessage(messageId, conversationId, userId, auth = null) {
  const mid = assertObjectId(messageId, 'messageId');
  const cid = assertObjectId(conversationId, 'conversationId');
  await getAuthorizedMembership(cid, userId, auth);

  const PinnedMessage = require('../models/pinned-message.model').getPinnedMessageModel();
  await PinnedMessage.deleteOne({ conversationId: cid, messageId: mid });
  return { unpinned: true };
}

async function setNotificationPreference(conversationId, userId, preference, auth = null) {
  const cid = assertObjectId(conversationId, 'conversationId');
  if (!['all', 'mentions_replies', 'muted'].includes(preference)) {
    throw new AppError('Invalid preference', { status: 400 });
  }
  await getAuthorizedMembership(cid, userId, auth);

  const NotificationPreference = require('../models/notification-preference.model').getNotificationPreferenceModel();
  const pref = await NotificationPreference.findOneAndUpdate(
    { userId, conversationId: cid },
    { userId, conversationId: cid, preference },
    { upsert: true, new: true }
  );
  return { preference: pref.preference };
}

async function search(query, userId, limit, auth = null) {
  if (!query || query.trim().length < 2) {
    return { people: [], conversations: [], messages: [] };
  }

  const q = query.trim().toLowerCase();
  const results = { people: [], conversations: [], messages: [] };
  const userRepository = require('../../users/repositories/user.repository');

  // Search people
  try {
    const people = await userRepository.getUserModel()
      .find({
        $and: [
          { isDeleted: false },
          { _id: { $ne: userId } },
          { $or: [
            { displayName: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } },
          ] },
        ],
      })
      .select('_id displayName email role imageUrl')
      .limit(limit)
      .lean();

    results.people = people.map((u) => ({
      userId: String(u._id),
      displayName: u.displayName,
      email: u.email,
      role: u.role,
    }));
  } catch (_e) {
    // Silently skip on error
  }

  // Search conversations - only accessible ones
  try {
    const accessibleConversations = await participantRepository.listActiveByUserId(userId);
    const conversationIds = accessibleConversations.map((c) => c.conversationId);

    const conversations = await conversationRepository.model.find({
      _id: { $in: conversationIds },
      title: { $regex: q, $options: 'i' },
    })
      .select('_id title type')
      .limit(limit)
      .lean();

    results.conversations = conversations.map((c) => ({
      conversationId: String(c._id),
      title: c.title,
      type: c.type,
    }));
  } catch (_e) {
    // Silently skip on error
  }

  // Search messages - only in accessible conversations
  try {
    const accessibleConversations = await participantRepository.listActiveByUserId(userId);
    const conversationIds = accessibleConversations.map((c) => c.conversationId);

    const messages = await messageRepository.model.find({
      conversationId: { $in: conversationIds },
      isDeletedForEveryone: { $ne: true },
      text: { $regex: q, $options: 'i' },
    })
      .select('_id conversationId text senderId senderName createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    results.messages = messages.map((m) => ({
      messageId: String(m._id),
      conversationId: String(m.conversationId),
      text: m.text?.substring(0, 80),
      senderId: String(m.senderId),
      senderName: m.senderName,
      createdAt: m.createdAt,
    }));
  } catch (_e) {
    // Silently skip on error
  }

  return results;
}

module.exports = {
  createDirect,
  createProjectRoom,
  createGroup,
  listConversations,
  getConversation,
  listMessages,
  sendMessage,
  toggleReaction,
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
  listTeamMembers,
  getOnlineUserIds,
  getConfig,
  handleTyping,
  handleMessageDeliveryAck,
  assertConversationParticipant,
  downloadAttachment,
  search,
  saveMessage,
  unsaveMessage,
  pinMessage,
  unpinMessage,
  setNotificationPreference,
  forwardMessage,
};
