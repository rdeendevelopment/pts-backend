const { getDiscussFlowHandoffModel } = require('../models/discussFlowHandoff.model');

async function create(payload) {
  const Model = getDiscussFlowHandoffModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function findById(id, tenantId) {
  const Model = getDiscussFlowHandoffModel();
  return Model.findOne({ _id: id, tenantId }).lean();
}

async function updateById(id, tenantId, updates) {
  const Model = getDiscussFlowHandoffModel();
  return Model.findOneAndUpdate({ _id: id, tenantId }, { $set: updates }, { new: true }).lean();
}

async function countByStatus(topicId, status) {
  const Model = getDiscussFlowHandoffModel();
  return Model.countDocuments({ topicId, status });
}

async function countByTopic(topicId) {
  const Model = getDiscussFlowHandoffModel();
  const rows = await Model.aggregate([
    { $match: { topicId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = { pending: 0, created: 0, failed: 0, skipped: 0 };
  rows.forEach((row) => {
    if (counts[row._id] !== undefined) counts[row._id] = row.count;
  });
  return counts;
}

module.exports = {
  create,
  findById,
  updateById,
  countByStatus,
  countByTopic,
};
