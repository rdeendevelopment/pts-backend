const { getDiscussFlowGuestLinkModel } = require('../models/discussFlowGuestLink.model');

async function findByTokenHash(tokenHash) {
  const Model = getDiscussFlowGuestLinkModel();
  return Model.findOne({ tokenHash }).lean();
}

async function findById(id, tenantId) {
  const Model = getDiscussFlowGuestLinkModel();
  return Model.findOne({ _id: id, tenantId }).lean();
}

async function create(payload) {
  const Model = getDiscussFlowGuestLinkModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function updateById(id, tenantId, updates) {
  const Model = getDiscussFlowGuestLinkModel();
  return Model.findOneAndUpdate({ _id: id, tenantId }, { $set: updates }, { new: true }).lean();
}

async function incrementUsedCount(id) {
  const Model = getDiscussFlowGuestLinkModel();
  const now = new Date();
  return Model.findOneAndUpdate(
    { _id: id },
    { $inc: { usedCount: 1 }, $set: { lastUsedAt: now } },
    { new: true }
  ).lean();
}

async function listByTopic(topicId, { limit = 200 } = {}) {
  const Model = getDiscussFlowGuestLinkModel();
  return Model.find({ topicId }).sort({ createdAt: -1 }).limit(limit).lean();
}

module.exports = {
  findByTokenHash,
  findById,
  create,
  updateById,
  incrementUsedCount,
  listByTopic,
};
