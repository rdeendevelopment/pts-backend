const { getMessageModel } = require('../models/message.model');

async function nextSequence(conversationId) {
  const Message = getMessageModel();
  const last = await Message.findOne({ conversationId })
    .sort({ sequence: -1 })
    .select('sequence')
    .lean();
  return (last?.sequence || 0) + 1;
}

async function createMessage(data) {
  const Message = getMessageModel();
  return Message.create(data);
}

async function findById(messageId) {
  const Message = getMessageModel();
  return Message.findOne({ _id: messageId, isDeletedForEveryone: false }).exec();
}

async function listByConversation(conversationId, userId, { skip = 0, limit = 40 } = {}) {
  const Message = getMessageModel();
  const filter = {
    conversationId,
    isDeletedForEveryone: false,
    deletedForUsers: { $ne: userId },
  };
  const [items, total] = await Promise.all([
    Message.find(filter).sort({ sequence: -1 }).skip(skip).limit(limit).lean(),
    Message.countDocuments(filter),
  ]);
  return { items, total };
}

async function updateMessage(messageId, updates) {
  const Message = getMessageModel();
  return Message.findOneAndUpdate({ _id: messageId }, { $set: updates }, { new: true }).exec();
}

async function pushReadReceipt(messageId, userId, readAt) {
  const Message = getMessageModel();
  return Message.updateOne(
    { _id: messageId, 'readBy.userId': { $ne: userId } },
    { $push: { readBy: { userId, readAt } } }
  );
}

module.exports = {
  nextSequence,
  createMessage,
  findById,
  listByConversation,
  updateMessage,
  pushReadReceipt,
};
