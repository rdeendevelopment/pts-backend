const mongoose = require('mongoose');
const { AccountAdmin, CoreUser } = require('../../../MongoModels/core.model');
const Conversation = require('../models/conversation.model');
const ConversationMember = require('../models/conversationMember.model');
const { makeDirectKey } = require('../utils/directKey.util');
const { sanitizeText } = require('../utils/sanitizeMessage.util');
const { CONVERSATION_TYPES, MEMBER_ROLES } = require('../constants/converse.constants');
const { mapConversationDTO } = require('./converseMapper.service');

// ─── Direct chat ──────────────────────────────────────────────────────────────

async function createDirect(actorId, actorName, recipientId) {
  const directKey = makeDirectKey(actorId, recipientId);

  const existing = await Conversation.findOne({
    type: CONVERSATION_TYPES.DIRECT,
    directKey,
    isDeleted: false,
  }).lean();

  if (existing) {
    const member = await ConversationMember.findOne({
      conversationId: existing._id,
      userId: actorId,
    }).lean();
    const dto = mapConversationDTO(existing, member);
    await enrichDirectConversation(dto, actorId);
    return { conversation: dto, created: false };
  }

  const conv = await Conversation.create({
    type: CONVERSATION_TYPES.DIRECT,
    directKey,
    memberIds: [actorId, recipientId],
    memberCount: 2,
    createdBy: actorId,
  });

  await ConversationMember.create([
    { conversationId: conv._id, userId: actorId, role: MEMBER_ROLES.MEMBER, joinedAt: new Date() },
    { conversationId: conv._id, userId: recipientId, role: MEMBER_ROLES.MEMBER, joinedAt: new Date() },
  ]);

  const member = await ConversationMember.findOne({
    conversationId: conv._id,
    userId: actorId,
  }).lean();

  const dto = mapConversationDTO(conv.toObject(), member);
  await enrichDirectConversation(dto, actorId);
  return { conversation: dto, created: true };
}

// ─── Group chat ───────────────────────────────────────────────────────────────

async function createGroup(actorId, actorName, title, memberIds) {
  const sanitizedTitle = sanitizeText(title);

  const allMemberObjectIds = Array.from(
    new Set([String(actorId), ...memberIds.map(String)])
  ).map((id) => new mongoose.Types.ObjectId(id));

  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (_) {
    session = null;
  }

  const conv = new Conversation({
    type: CONVERSATION_TYPES.GROUP,
    title: sanitizedTitle,
    memberIds: allMemberObjectIds,
    memberCount: allMemberObjectIds.length,
    adminIds: [actorId],
    createdBy: actorId,
  });

  const memberDocs = allMemberObjectIds.map((uid) => ({
    conversationId: conv._id,
    userId: uid,
    role: String(uid) === String(actorId) ? MEMBER_ROLES.OWNER : MEMBER_ROLES.MEMBER,
    joinedAt: new Date(),
  }));

  try {
    if (session) {
      await session.withTransaction(async () => {
        await conv.save({ session });
        await ConversationMember.insertMany(memberDocs, { session });
      });
    } else {
      await conv.save();
      try {
        await ConversationMember.insertMany(memberDocs);
      } catch (memberErr) {
        await Conversation.deleteOne({ _id: conv._id }).catch(() => {});
        throw memberErr;
      }
    }
  } finally {
    if (session) session.endSession().catch(() => {});
  }

  const ownerMember = await ConversationMember.findOne({
    conversationId: conv._id,
    userId: actorId,
  }).lean();

  return { conversation: mapConversationDTO(conv.toObject(), ownerMember), created: true };
}

// ─── List ─────────────────────────────────────────────────────────────────────

async function getConversationList(actorId) {
  // Query conversation_members by userId first (indexed)
  const memberships = await ConversationMember.find({
    userId: actorId,
    isDeletedForMe: false,
    leftAt: null,
  }).lean();

  if (!memberships.length) return [];

  const convIds = memberships.map((m) => m.conversationId);
  const memberMap = {};
  memberships.forEach((m) => {
    memberMap[String(m.conversationId)] = m;
  });

  const conversations = await Conversation.find({
    _id: { $in: convIds },
    isDeleted: false,
  }).lean();

  const dtos = await Promise.all(conversations
    .map(async (conv) => {
      const dto = mapConversationDTO(conv, memberMap[String(conv._id)]);
      await enrichDirectConversation(dto, actorId);
      return dto;
    }));

  return dtos
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
}

// ─── Detail ───────────────────────────────────────────────────────────────────

async function getConversationDetail(conversationId, actorId) {
  const [conv, member] = await Promise.all([
    Conversation.findOne({ _id: conversationId, isDeleted: false }).lean(),
    ConversationMember.findOne({ conversationId, userId: actorId, leftAt: null }).lean(),
  ]);
  if (!conv || !member) return null;
  const dto = mapConversationDTO(conv, member);
  await enrichDirectConversation(dto, actorId);
  return dto;
}

async function enrichDirectConversation(dto, actorId) {
  if (!dto || dto.type !== CONVERSATION_TYPES.DIRECT) return dto;
  const otherId = (dto.memberIds || []).map(String).find((id) => id !== String(actorId));
  if (!otherId) return dto;

  const other =
    await CoreUser.findOne({ _id: otherId }).select('_id firstName lastName email imageUrl').lean() ||
    await AccountAdmin.findOne({ _id: otherId }).select('_id name email imageUrl type').lean();

  if (!other) return dto;
  const displayName =
    other.name ||
    [other.firstName, other.lastName].filter(Boolean).join(' ') ||
    other.email ||
    'Direct conversation';

  dto.title = displayName;
  dto.avatar = other.imageUrl || dto.avatar || '';
  dto.directUser = {
    _id: other._id,
    displayName,
    email: other.email || '',
    imageUrl: other.imageUrl || '',
  };
  return dto;
}

// ─── Mute ─────────────────────────────────────────────────────────────────────

async function muteConversation(conversationId, actorId, isMuted) {
  await ConversationMember.updateOne(
    { conversationId, userId: actorId },
    { $set: { isMuted: Boolean(isMuted) } }
  );
}

// ─── Delete for me ────────────────────────────────────────────────────────────

async function deleteForMe(conversationId, actorId) {
  await ConversationMember.updateOne(
    { conversationId, userId: actorId },
    { $set: { isDeletedForMe: true } }
  );
}

// ─── Leave group ──────────────────────────────────────────────────────────────

async function leaveGroup(conversationId, actorId) {
  const conv = await Conversation.findOne({ _id: conversationId, isDeleted: false }).lean();
  if (!conv) throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });

  if (conv.type !== CONVERSATION_TYPES.GROUP) {
    throw Object.assign(new Error('Cannot leave a direct conversation'), { statusCode: 422 });
  }

  const leavingMember = await ConversationMember.findOne({
    conversationId,
    userId: actorId,
    leftAt: null,
  }).lean();
  if (!leavingMember) throw Object.assign(new Error('You are not an active member'), { statusCode: 403 });

  if (leavingMember.role === MEMBER_ROLES.OWNER) {
    const otherAdmin = await ConversationMember.findOne({
      conversationId,
      userId: { $ne: actorId },
      role: { $in: [MEMBER_ROLES.OWNER, MEMBER_ROLES.ADMIN] },
      leftAt: null,
    }).lean();
    if (!otherAdmin) {
      throw Object.assign(
        new Error('Transfer ownership before leaving — no other owner or admin exists'),
        { statusCode: 422 }
      );
    }
  }

  await ConversationMember.updateOne(
    { conversationId, userId: actorId },
    { $set: { leftAt: new Date() } }
  );

  await Conversation.updateOne(
    { _id: conversationId },
    { $pull: { memberIds: actorId }, $inc: { memberCount: -1 } }
  );
}

async function pinConversation(conversationId, actorId, isPinned) {
  await ConversationMember.updateOne(
    { conversationId, userId: actorId, leftAt: null },
    { $set: { isPinned: Boolean(isPinned) } }
  );
}

module.exports = {
  createDirect,
  createGroup,
  getConversationList,
  getConversationDetail,
  muteConversation,
  deleteForMe,
  leaveGroup,
  pinConversation,
};
