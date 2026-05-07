const { TimeEntry } = require('../MongoModels');
const { labelMinutes } = require('./project-dashboard.service');

async function getTaskTimeSummary(projectId) {
  const match = { taskId: { $nin: [null, ''] }, status: { $in: ['submitted', 'approved'] } };
  if (projectId) match.legacyProjectId = Number(projectId);
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
