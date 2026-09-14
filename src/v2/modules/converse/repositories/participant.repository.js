const { getConversationParticipantModel } = require('../models/conversationParticipant.model');
const { Types } = require('mongoose');

function activeFilter(extra = {}) {
  return { leftAt: null, isDeletedForMe: false, ...extra };
}

async function findMembership(conversationId, userId) {
  const Participant = getConversationParticipantModel();
  return Participant.findOne({ conversationId, userId }).exec();
}

async function findActiveMembership(conversationId, userId) {
  const Participant = getConversationParticipantModel();
  return Participant.findOne(activeFilter({ conversationId, userId })).exec();
}

async function listActiveByUserId(userId) {
  const Participant = getConversationParticipantModel();
  return Participant.find(activeFilter({ userId })).lean();
}

async function listActiveByConversationId(conversationId) {
  const Participant = getConversationParticipantModel();
  return Participant.find(activeFilter({ conversationId })).lean();
}

async function createParticipants(rows) {
  const Participant = getConversationParticipantModel();
  return Participant.insertMany(rows);
}

async function ensureParticipant(conversationId, userId, role = 'member') {
  const Participant = getConversationParticipantModel();
  return Participant.findOneAndUpdate(
    { conversationId, userId },
    { $setOnInsert: { role, joinedAt: new Date() }, $set: { leftAt: null, isDeletedForMe: false } },
    { upsert: true, new: true }
  ).exec();
}

async function updateParticipant(conversationId, userId, updates) {
  const Participant = getConversationParticipantModel();
  return Participant.findOneAndUpdate(
    { conversationId, userId },
    { $set: updates },
    { new: true }
  ).exec();
}

async function incrementUnreadForOthers(conversationId, senderUserId, allowedUserIds = null) {
  const Participant = getConversationParticipantModel();
  const filter = activeFilter({ conversationId, userId: { $ne: senderUserId } });
  if (allowedUserIds) filter.userId = { $ne: senderUserId, $in: allowedUserIds };
  return Participant.updateMany(
    filter,
    { $inc: { unreadCount: 1 } }
  );
}

async function incrementMentions(conversationId, userIds) {
  if (!userIds.length) return;
  const Participant = getConversationParticipantModel();
  await Participant.updateMany(
    activeFilter({ conversationId, userId: { $in: userIds } }),
    { $inc: { mentionCount: 1 } }
  );
}

async function sumUnreadForUser(userId) {
  const Participant = getConversationParticipantModel();
  const rows = await Participant.aggregate([
    { $match: activeFilter({ userId: new Types.ObjectId(String(userId)) }) },
    { $group: { _id: null, total: { $sum: '$unreadCount' } } },
  ]);
  return Number(rows[0]?.total || 0);
}

module.exports = {
  findMembership,
  findActiveMembership,
  listActiveByUserId,
  listActiveByConversationId,
  createParticipants,
  ensureParticipant,
  updateParticipant,
  incrementUnreadForOthers,
  incrementMentions,
  sumUnreadForUser,
};
