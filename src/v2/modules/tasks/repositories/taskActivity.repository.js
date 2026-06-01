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
  listRecent,
};
