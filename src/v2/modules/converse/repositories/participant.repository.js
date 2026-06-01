const { getConversationParticipantModel } = require('../models/conversationParticipant.model');

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

async function updateParticipant(conversationId, userId, updates) {
  const Participant = getConversationParticipantModel();
  return Participant.findOneAndUpdate(
    { conversationId, userId },
    { $set: updates },
    { new: true }
  ).exec();
}

async function incrementUnreadForOthers(conversationId, senderUserId) {
  const Participant = getConversationParticipantModel();
  return Participant.updateMany(
    activeFilter({ conversationId, userId: { $ne: senderUserId } }),
    { $inc: { unreadCount: 1 } }
  );
}

async function sumUnreadForUser(userId) {
  const Participant = getConversationParticipantModel();
  const rows = await Participant.find(activeFilter({ userId })).select('unreadCount').lean();
  return rows.reduce((sum, row) => sum + Number(row.unreadCount || 0), 0);
}

module.exports = {
  findMembership,
  findActiveMembership,
  listActiveByUserId,
  listActiveByConversationId,
  createParticipants,
  updateParticipant,
  incrementUnreadForOthers,
  sumUnreadForUser,
};
