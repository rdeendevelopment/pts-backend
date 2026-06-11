const { getDiscussFlowTimelineModel } = require('../models/discussFlowTimeline.model');

async function list(topicId, { limit, skip } = {}) {
  const Model = getDiscussFlowTimelineModel();
  const query = { topicId };

  const [items, total] = await Promise.all([
    Model.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Model.countDocuments(query),
  ]);
  return { items, total };
}

async function create(payload) {
  const Model = getDiscussFlowTimelineModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

module.exports = {
  list,
  create,
};
