const { getConversationModel } = require('../models/conversation.model');

async function findById(conversationId, { includeDeleted = false } = {}) {
  const Conversation = getConversationModel();
  const query = { _id: conversationId };
  if (!includeDeleted) query.isDeleted = false;
  return Conversation.findOne(query).exec();
}

async function findDirectByKey(directKey) {
  const Conversation = getConversationModel();
  return Conversation.findOne({ type: 'direct', directKey, isDeleted: false }).exec();
}

async function createConversation(data) {
  const Conversation = getConversationModel();
  return Conversation.create(data);
}

async function updateConversation(conversationId, updates) {
  const Conversation = getConversationModel();
  return Conversation.findOneAndUpdate(
    { _id: conversationId, isDeleted: false },
    { $set: updates },
    { new: true }
  ).exec();
}

module.exports = {
  findById,
  findDirectByKey,
  createConversation,
  updateConversation,
};
