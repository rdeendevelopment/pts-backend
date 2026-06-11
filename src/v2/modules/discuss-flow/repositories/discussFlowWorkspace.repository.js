const { getDiscussFlowWorkspaceModel } = require('../models/discussFlowWorkspace.model');

function activeQuery(tenantId, extra = {}) {
  return { tenantId, isDeleted: false, ...extra };
}

async function findById(id, tenantId) {
  const Model = getDiscussFlowWorkspaceModel();
  return Model.findOne(activeQuery(tenantId, { _id: id })).lean();
}

async function findBySlug(tenantId, slug) {
  const Model = getDiscussFlowWorkspaceModel();
  return Model.findOne(activeQuery(tenantId, { slug })).lean();
}

async function slugExists(tenantId, slug, excludeId = null) {
  const Model = getDiscussFlowWorkspaceModel();
  const query = activeQuery(tenantId, { slug });
  if (excludeId) query._id = { $ne: excludeId };
  return Boolean(await Model.exists(query));
}

async function list(tenantId, { search, status, limit, skip } = {}) {
  const Model = getDiscussFlowWorkspaceModel();
  const query = activeQuery(tenantId);
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

async function create(payload) {
  const Model = getDiscussFlowWorkspaceModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function updateById(id, tenantId, updates) {
  const Model = getDiscussFlowWorkspaceModel();
  return Model.findOneAndUpdate(activeQuery(tenantId, { _id: id }), { $set: updates }, { new: true }).lean();
}

async function incrementTopicCount(id, tenantId, delta = 1) {
  const Model = getDiscussFlowWorkspaceModel();
  return Model.findOneAndUpdate(
    activeQuery(tenantId, { _id: id }),
    { $inc: { topicCount: delta } },
    { new: true }
  ).lean();
}

module.exports = {
  findById,
  findBySlug,
  slugExists,
  list,
  create,
  updateById,
  incrementTopicCount,
};
