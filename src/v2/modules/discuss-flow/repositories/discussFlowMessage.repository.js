const { getDiscussFlowMessageModel } = require('../models/discussFlowMessage.model');

function activeQuery(topicId, extra = {}) {
  return { topicId, isDeleted: false, ...extra };
}

async function findById(id, topicId) {
  const Model = getDiscussFlowMessageModel();
  return Model.findOne(activeQuery(topicId, { _id: id })).lean();
}

async function list(topicId, { search, limit, skip } = {}) {
  const Model = getDiscussFlowMessageModel();
  const query = activeQuery(topicId);

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
  const Model = getDiscussFlowMessageModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function createMany(payloads) {
  if (!payloads.length) return [];
  const Model = getDiscussFlowMessageModel();
  const docs = await Model.insertMany(payloads);
  return docs.map((doc) => doc.toObject());
}

async function listByImportBatch(topicId, importBatchId) {
  const Model = getDiscussFlowMessageModel();
  return Model.find(activeQuery(topicId, { importBatchId: String(importBatchId) }))
    .sort({ createdAt: 1 })
    .lean();
}

async function updateById(id, topicId, updates) {
  const Model = getDiscussFlowMessageModel();
  return Model.findOneAndUpdate(
    activeQuery(topicId, { _id: id, messageStatus: { $ne: 'deleted' } }),
    { $set: updates },
    { new: true }
  ).lean();
}

async function softDeleteById(id, topicId) {
  const Model = getDiscussFlowMessageModel();
  const now = new Date();
  return Model.findOneAndUpdate(
    activeQuery(topicId, { _id: id }),
    {
      $set: {
        isDeleted: true,
        deletedAt: now,
        messageStatus: 'deleted',
      },
    },
    { new: true }
  ).lean();
}

async function findByIdIncludingDeleted(id, topicId) {
  const Model = getDiscussFlowMessageModel();
  return Model.findOne({ topicId, _id: id }).lean();
}

async function listByTopicIds(topicIds, { search, limit, skip } = {}) {
  const Model = getDiscussFlowMessageModel();
  const query = { topicId: { $in: topicIds }, isDeleted: false };

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

async function listRecent(topicId, limit = 10) {
  const Model = getDiscussFlowMessageModel();
  return Model.find(activeQuery(topicId)).sort({ createdAt: -1 }).limit(limit).lean();
}

module.exports = {
  findById,
  findByIdIncludingDeleted,
  list,
  listRecent,
  create,
  createMany,
  listByImportBatch,
  listByTopicIds,
  updateById,
  softDeleteById,
};
