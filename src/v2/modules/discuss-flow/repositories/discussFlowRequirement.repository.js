const { getDiscussFlowRequirementModel } = require('../models/discussFlowRequirement.model');

function activeQuery(topicId, extra = {}) {
  return { topicId, isDeleted: false, ...extra };
}

async function list(topicId, { search, status, limit, skip } = {}) {
  const Model = getDiscussFlowRequirementModel();
  const query = activeQuery(topicId);
  if (status) query.status = status;

  if (search) {
    const items = await Model.find({ ...query, $text: { $search: search } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await Model.countDocuments({ ...query, $text: { $search: search } });
    return { items, total };
  }

  const [items, total] = await Promise.all([
    Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
  ]);
  return { items, total };
}

async function create(payload) {
  const Model = getDiscussFlowRequirementModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function listRecent(topicId, limit = 5) {
  const Model = getDiscussFlowRequirementModel();
  return Model.find(activeQuery(topicId))
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

async function countInReview(topicId) {
  const Model = getDiscussFlowRequirementModel();
  return Model.countDocuments(activeQuery(topicId, { status: 'review' }));
}

async function findById(id, tenantId) {
  const Model = getDiscussFlowRequirementModel();
  return Model.findOne({ _id: id, tenantId, isDeleted: false }).lean();
}

async function updateById(id, tenantId, updates) {
  const Model = getDiscussFlowRequirementModel();
  return Model.findOneAndUpdate(
    { _id: id, tenantId, isDeleted: false },
    { $set: updates },
    { new: true }
  ).lean();
}

async function countByStatus(topicId, status) {
  const Model = getDiscussFlowRequirementModel();
  return Model.countDocuments(activeQuery(topicId, { status }));
}

async function listByTopicIds(topicIds, { status, search, limit, skip } = {}) {
  const Model = getDiscussFlowRequirementModel();
  const query = { topicId: { $in: topicIds }, isDeleted: false };
  if (status) query.status = status;

  if (search) {
    const items = await Model.find({ ...query, $text: { $search: search } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await Model.countDocuments({ ...query, $text: { $search: search } });
    return { items, total };
  }

  const [items, total] = await Promise.all([
    Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
  ]);
  return { items, total };
}

async function listByStatus(topicId, status, limit = 20) {
  const Model = getDiscussFlowRequirementModel();
  return Model.find(activeQuery(topicId, { status })).sort({ updatedAt: -1 }).limit(limit).lean();
}

module.exports = {
  list,
  create,
  findById,
  updateById,
  listRecent,
  countInReview,
  countByStatus,
  listByTopicIds,
  listByStatus,
};
