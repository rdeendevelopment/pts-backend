const { getTaskActivityModel } = require('../models/taskActivity.model');

async function createActivity(payload) {
  const TaskActivity = getTaskActivityModel();
  return TaskActivity.create(payload);
}

async function deleteByTaskId(taskId) {
  const TaskActivity = getTaskActivityModel();
  return TaskActivity.deleteMany({ taskId }).exec();
}

async function listByTaskIds(taskIds = [], { limit = 100 } = {}) {
  const ids = [...new Set((taskIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return [];

  const TaskActivity = getTaskActivityModel();
  return TaskActivity.find({ taskId: { $in: ids } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

async function listPageByTaskIds(taskIds = [], {
  page = 1,
  limit = 25,
  projectId,
  eventType,
  dateFrom,
  dateTo,
} = {}) {
  const ids = [...new Set((taskIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return { items: [], total: 0 };

  const match = { taskId: { $in: ids } };
  if (projectId) match.projectId = projectId;
  if (eventType) match.eventType = eventType;
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = dateFrom;
    if (dateTo) match.createdAt.$lte = dateTo;
  }

  const TaskActivity = getTaskActivityModel();
  const [items, total] = await Promise.all([
    TaskActivity.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    TaskActivity.countDocuments(match),
  ]);
  return { items, total };
}

async function listRecent({ limit = 50 } = {}) {
  const TaskActivity = getTaskActivityModel();
  return TaskActivity.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

module.exports = {
  createActivity,
  deleteByTaskId,
  listByTaskIds,
  listPageByTaskIds,
  listRecent,
};
