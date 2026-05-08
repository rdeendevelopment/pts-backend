const { TimeEntry } = require('../MongoModels');
const { mongoose } = require('../../../config/mongo');
const { labelMinutes } = require('./project-dashboard.service');

async function getTaskTimeSummary(projectId, taskIds = []) {
  const match = { taskId: { $nin: [null, ''] }, status: { $in: ['submitted', 'approved'] } };
  if (projectId) match.legacyProjectId = Number(projectId);
  if (Array.isArray(taskIds) && taskIds.length) {
    match.taskId = {
      $in: taskIds
        .filter((taskId) => mongoose.isValidObjectId(taskId))
        .map((taskId) => new mongoose.Types.ObjectId(taskId)),
    };
  }
  const rows = await TimeEntry.aggregate([
    { $match: match },
    { $group: { _id: '$taskId', totalMinutes: { $sum: '$durationMinutes' } } },
    { $sort: { totalMinutes: -1 } },
  ]);
  return rows.map((row) => ({
    taskId: String(row._id),
    totalMinutes: Number(row.totalMinutes || 0),
    label: labelMinutes(row.totalMinutes),
  }));
}

module.exports = { getTaskTimeSummary };
