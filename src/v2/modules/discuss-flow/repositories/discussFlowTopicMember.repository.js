const { getDiscussFlowTopicMemberModel } = require('../models/discussFlowTopicMember.model');

function activeQuery(extra = {}) {
  return { isDeleted: false, ...extra };
}

async function findByTopicAndAccount(topicId, accountId) {
  const Model = getDiscussFlowTopicMemberModel();
  return Model.findOne(activeQuery({ topicId, accountId })).lean();
}

async function listByTopic(topicId) {
  const Model = getDiscussFlowTopicMemberModel();
  return Model.find(activeQuery({ topicId })).sort({ joinedAt: 1 }).lean();
}

async function create(payload) {
  const Model = getDiscussFlowTopicMemberModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function updateById(id, updates) {
  const Model = getDiscussFlowTopicMemberModel();
  return Model.findOneAndUpdate(activeQuery({ _id: id }), { $set: updates }, { new: true }).lean();
}

async function countByTopic(topicId) {
  const Model = getDiscussFlowTopicMemberModel();
  return Model.countDocuments(activeQuery({ topicId }));
}

module.exports = {
  findByTopicAndAccount,
  listByTopic,
  create,
  updateById,
  countByTopic,
};
