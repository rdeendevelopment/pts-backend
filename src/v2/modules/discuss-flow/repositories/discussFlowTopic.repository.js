const { getDiscussFlowTopicModel } = require('../models/discussFlowTopic.model');

function activeQuery(tenantId, extra = {}) {
  return { tenantId, isDeleted: false, ...extra };
}

async function findById(id, tenantId) {
  const Model = getDiscussFlowTopicModel();
  return Model.findOne(activeQuery(tenantId, { _id: id })).lean();
}

async function slugExists(workspaceId, slug, excludeId = null) {
  const Model = getDiscussFlowTopicModel();
  const query = { workspaceId, slug, isDeleted: false };
  if (excludeId) query._id = { $ne: excludeId };
  return Boolean(await Model.exists(query));
}

async function list(tenantId, { workspaceId, status, search, limit, skip } = {}) {
  const Model = getDiscussFlowTopicModel();
  const query = activeQuery(tenantId);
  if (workspaceId) query.workspaceId = workspaceId;
  if (status) query.status = status;

  if (search) {
    const items = await Model.find({ ...query, $text: { $search: search } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, lastActivityAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await Model.countDocuments({ ...query, $text: { $search: search } });
    return { items, total };
  }

  const [items, total] = await Promise.all([
    Model.find(query).sort({ lastActivityAt: -1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
  ]);
  return { items, total };
}

async function create(payload) {
  const Model = getDiscussFlowTopicModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function updateById(id, tenantId, updates) {
  const Model = getDiscussFlowTopicModel();
  return Model.findOneAndUpdate(activeQuery(tenantId, { _id: id }), { $set: updates }, { new: true }).lean();
}

async function incrementCounter(id, tenantId, field, delta = 1) {
  const Model = getDiscussFlowTopicModel();
  return Model.findOneAndUpdate(
    activeQuery(tenantId, { _id: id }),
    { $inc: { [field]: delta }, $set: { lastActivityAt: new Date() } },
    { new: true }
  ).lean();
}

async function listIds(tenantId, workspaceId = null) {
  const Model = getDiscussFlowTopicModel();
  const query = activeQuery(tenantId);
  if (workspaceId) query.workspaceId = workspaceId;
  const rows = await Model.find(query).select('_id').lean();
  return rows.map((row) => row._id);
}

async function touchMessageActivity(id, tenantId) {
  const Model = getDiscussFlowTopicModel();
  const now = new Date();
  return Model.findOneAndUpdate(
    activeQuery(tenantId, { _id: id }),
    { $set: { lastActivityAt: now, lastMessageAt: now } },
    { new: true }
  ).lean();
}

module.exports = {
  findById,
  slugExists,
  list,
  listIds,
  create,
  updateById,
  incrementCounter,
  touchMessageActivity,
};
