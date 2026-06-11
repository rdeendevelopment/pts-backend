const { getDiscussFlowQuestionModel } = require('../models/discussFlowQuestion.model');

function activeQuery(topicId, extra = {}) {
  return { topicId, isDeleted: false, ...extra };
}

async function list(topicId, { status, limit, skip } = {}) {
  const Model = getDiscussFlowQuestionModel();
  const query = activeQuery(topicId);
  if (status) query.status = status;

  const [items, total] = await Promise.all([
    Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
  ]);
  return { items, total };
}

async function create(payload) {
  const Model = getDiscussFlowQuestionModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function countOpen(topicId) {
  const Model = getDiscussFlowQuestionModel();
  return Model.countDocuments(activeQuery(topicId, { status: { $in: ['open', 'blocked'] } }));
}

async function listRecent(topicId, limit = 5) {
  const Model = getDiscussFlowQuestionModel();
  return Model.find(activeQuery(topicId, { status: { $in: ['open', 'blocked'] } }))
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

module.exports = {
  list,
  create,
  countOpen,
  listRecent,
};
