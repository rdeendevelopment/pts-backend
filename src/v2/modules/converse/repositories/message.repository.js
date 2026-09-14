const { getMessageModel } = require('../models/message.model');
const { getConversationModel } = require('../models/conversation.model');

async function nextSequence(conversationId) {
  const Message = getMessageModel();
  const last = await Message.findOne({ conversationId })
    .sort({ sequence: -1 })
    .select('sequence')
    .lean();
  const Conversation = getConversationModel();
  const lastSequence = Number(last?.sequence || 0);
  if (lastSequence) {
    await Conversation.updateOne(
      { _id: conversationId, $or: [
        { messageSequence: { $exists: false } },
        { messageSequence: { $lt: lastSequence } },
      ] },
      { $set: { messageSequence: lastSequence } }
    );
  }
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, isDeleted: false },
    { $inc: { messageSequence: 1 } },
    { new: true }
  ).exec();
  return conversation?.messageSequence || null;
}

async function createMessage(data) {
  const Message = getMessageModel();
  return Message.create(data);
}

async function findById(messageId) {
  const Message = getMessageModel();
  return Message.findOne({ _id: messageId, isDeletedForEveryone: false }).exec();
}

async function findAnyById(messageId) {
  const Message = getMessageModel();
  return Message.findOne({ _id: messageId }).exec();
}

async function listByConversation(conversationId, userId, { beforeCursor = null, limit = 40 } = {}) {
  const Message = getMessageModel();
  const filter = {
    conversationId,
    isDeletedForEveryone: false,
    deletedForUsers: { $ne: userId },
    ...(beforeCursor ? { $or: [
      { sequence: { $lt: beforeCursor.sequence } },
      { sequence: beforeCursor.sequence, _id: { $lt: beforeCursor.messageId } },
    ] } : {}),
  };
  const rows = await Message.find(filter).sort({ sequence: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, hasMore, nextCursor: hasMore ? `${last.sequence}:${last._id}` : null };
}

async function countUnreadAfter(conversationId, userId, sequence) {
  const Message = getMessageModel();
  return Message.countDocuments({
    conversationId,
    sequence: { $gt: sequence },
    senderId: { $ne: userId },
    isDeletedForEveryone: false,
    deletedForUsers: { $ne: userId },
  });
}

async function updateMessage(messageId, updates) {
  const Message = getMessageModel();
  return Message.findOneAndUpdate({ _id: messageId }, { $set: updates }, { new: true }).exec();
}

async function toggleReaction(messageId, userId, emoji) {
  const Message = getMessageModel();
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await Message.findById(messageId).select('reactions').lean();
    if (!current) return null;
    const reaction = (current.reactions || []).find((row) => row.emoji === emoji);
    const hasReacted = (reaction?.userIds || []).some((id) => String(id) === String(userId));
    const filter = reaction
      ? { _id: messageId, 'reactions.emoji': emoji }
      : { _id: messageId, 'reactions.emoji': { $ne: emoji } };
    const update = !reaction
      ? { $push: { reactions: { emoji, userIds: [userId] } } }
      : hasReacted
        ? { $pull: { 'reactions.$.userIds': userId } }
        : { $addToSet: { 'reactions.$.userIds': userId } };
    const result = await Message.updateOne(filter, update);
    if (result.matchedCount) return Message.findById(messageId).exec();
  }
  throw new Error('Reaction changed concurrently; retry');
}

async function pushReadReceipt(messageId, userId, readAt) {
  const Message = getMessageModel();
  return Message.updateOne(
    { _id: messageId, 'readBy.userId': { $ne: userId } },
    { $push: { readBy: { userId, readAt } } }
  );
}

async function pushDeliveryReceipt(messageId, userId, deliveredAt = null) {
  const Message = getMessageModel();
  return Message.updateOne(
    { _id: messageId, 'deliveredTo.userId': { $ne: userId } },
    { $push: { deliveredTo: { userId, deliveredAt: deliveredAt || new Date() } } }
  );
}

async function findByClientMessageId(conversationId, senderId, clientMessageId) {
  if (!clientMessageId) return null;
  const Message = getMessageModel();
  return Message.findOne({ conversationId, senderId, clientMessageId }).exec();
}

async function findUnseenAfterSequence(conversationId, viewerUserId, sequence, senderId) {
  const Message = getMessageModel();
  return Message.find({
    conversationId,
    sequence: { $gt: sequence },
    senderId: { $eq: senderId },
    'readBy.userId': { $ne: viewerUserId },
    isDeletedForEveryone: false,
    deletedForUsers: { $ne: viewerUserId },
  }).sort({ sequence: 1 }).select('_id sequence').lean();
}

module.exports = {
  nextSequence,
  createMessage,
  findById,
  findAnyById,
  findByClientMessageId,
  listByConversation,
  countUnreadAfter,
  updateMessage,
  toggleReaction,
  pushReadReceipt,
  pushDeliveryReceipt,
  findUnseenAfterSequence,
};
