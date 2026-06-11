const { getDiscussFlowAiReviewItemModel } = require('../models/discussFlowAiReviewItem.model');

function buildQuery(topicId, filters = {}) {
  const query = { topicId };
  if (filters.tenantId) query.tenantId = filters.tenantId;
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  if (filters.importBatchId) query.importBatchId = filters.importBatchId;
  if (filters.messageId) query.messageId = filters.messageId;
  return query;
}

async function create(payload) {
  const Model = getDiscussFlowAiReviewItemModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function createMany(payloads) {
  if (!payloads.length) return [];
  const Model = getDiscussFlowAiReviewItemModel();
  const docs = await Model.insertMany(payloads);
  return docs.map((doc) => doc.toObject());
}

async function findById(id, tenantId) {
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.findOne({ _id: id, tenantId }).lean();
}

async function findByIds(ids, tenantId) {
  if (!ids?.length) return [];
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.find({ _id: { $in: ids }, tenantId }).lean();
}

async function updateById(id, tenantId, updates) {
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.findOneAndUpdate({ _id: id, tenantId }, { $set: updates }, { new: true }).lean();
}

async function list(topicId, { tenantId, type, status, importBatchId, messageId, limit, skip } = {}) {
  const Model = getDiscussFlowAiReviewItemModel();
  const query = buildQuery(topicId, { tenantId, type, status, importBatchId, messageId });

  const [items, total] = await Promise.all([
    Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
  ]);

  return { items, total };
}

async function countByStatus(topicId, status) {
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.countDocuments({ topicId, status });
}

async function countByAiJobId(aiJobId) {
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.countDocuments({ createdByAiJobId: aiJobId });
}

async function countHighConfidencePending(topicId, threshold = 0.8) {
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.countDocuments({
    topicId,
    status: 'pending',
    confidence: { $gte: threshold },
  });
}

async function listRecent(topicId, limit = 5) {
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.find({ topicId, status: 'pending' })
    .sort({ confidence: -1, createdAt: -1 })
    .limit(limit)
    .lean();
}

async function listByMessage(topicId, messageId) {
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.find({
    topicId,
    $or: [
      { messageId },
      { linkedMessageIds: messageId },
    ],
  }).sort({ createdAt: -1 }).lean();
}

async function listPending(topicId, limit = 20) {
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.find({ topicId, status: { $in: ['pending', 'edited'] } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

async function listPendingNextActions(topicId, limit = 5) {
  const Model = getDiscussFlowAiReviewItemModel();
  return Model.find({ topicId, type: 'next_action', status: 'pending' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

module.exports = {
  create,
  createMany,
  findById,
  findByIds,
  updateById,
  list,
  countByStatus,
  countByAiJobId,
  countHighConfidencePending,
  listRecent,
  listByMessage,
  listPending,
  listPendingNextActions,
};
