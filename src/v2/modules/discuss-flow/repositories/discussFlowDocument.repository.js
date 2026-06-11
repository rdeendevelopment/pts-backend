const { getDiscussFlowDocumentModel } = require('../models/discussFlowDocument.model');

function activeQuery(extra = {}) {
  return { isDeleted: false, ...extra };
}

async function findById(id, tenantId) {
  const Model = getDiscussFlowDocumentModel();
  return Model.findOne(activeQuery({ _id: id, tenantId })).lean();
}

async function findBySourceAiJobId(aiJobId, tenantId) {
  const Model = getDiscussFlowDocumentModel();
  return Model.findOne(activeQuery({ sourceAiJobId: aiJobId, tenantId })).lean();
}

async function slugExists(topicId, slug, excludeId = null) {
  const Model = getDiscussFlowDocumentModel();
  const query = activeQuery({ topicId, slug });
  if (excludeId) query._id = { $ne: excludeId };
  return Boolean(await Model.exists(query));
}

async function list(topicId, { status, documentType, limit, skip } = {}) {
  const Model = getDiscussFlowDocumentModel();
  const query = activeQuery({ topicId });
  if (status) query.status = status;
  if (documentType) query.documentType = documentType;

  const [items, total] = await Promise.all([
    Model.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
  ]);
  return { items, total };
}

async function create(payload) {
  const Model = getDiscussFlowDocumentModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function updateById(id, tenantId, updates) {
  const Model = getDiscussFlowDocumentModel();
  return Model.findOneAndUpdate(activeQuery({ _id: id, tenantId }), { $set: updates }, { new: true }).lean();
}

async function listRecent(topicId, limit = 5) {
  const Model = getDiscussFlowDocumentModel();
  return Model.find(activeQuery({ topicId })).sort({ updatedAt: -1 }).limit(limit).lean();
}

async function countByStatus(topicId, status) {
  const Model = getDiscussFlowDocumentModel();
  return Model.countDocuments(activeQuery({ topicId, status }));
}

async function listByStatus(topicId, status, limit = 20) {
  const Model = getDiscussFlowDocumentModel();
  return Model.find(activeQuery({ topicId, status })).sort({ updatedAt: -1 }).limit(limit).lean();
}

async function listByTopicIds(topicIds, { status, search, limit, skip } = {}) {
  const Model = getDiscussFlowDocumentModel();
  const query = { topicId: { $in: topicIds }, isDeleted: false };
  if (status) query.status = status;

  if (search) {
    const items = await Model.find({ ...query, $text: { $search: search } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await Model.countDocuments({ ...query, $text: { $search: search } });
    return { items, total };
  }

  const [items, total] = await Promise.all([
    Model.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
  ]);
  return { items, total };
}

module.exports = {
  findById,
  findBySourceAiJobId,
  slugExists,
  list,
  create,
  updateById,
  listRecent,
  countByStatus,
  listByStatus,
  listByTopicIds,
};
