const { getProjectStatsModel } = require('../models/projectStats.model');

async function findByProjectId(projectId) {
  const ProjectStats = getProjectStatsModel();
  return ProjectStats.findOne({ projectId }).exec();
}

async function findByProjectIds(projectIds = []) {
  if (!projectIds.length) return [];

  const ProjectStats = getProjectStatsModel();
  return ProjectStats.find({ projectId: { $in: projectIds } }).lean().exec();
}

async function createStats(payload) {
  const ProjectStats = getProjectStatsModel();
  return ProjectStats.create(payload);
}

async function upsertStats(projectId, payload) {
  const ProjectStats = getProjectStatsModel();
  return ProjectStats.findOneAndUpdate(
    { projectId },
    { $set: payload },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).exec();
}

module.exports = {
  findByProjectId,
  findByProjectIds,
  createStats,
  upsertStats,
};
