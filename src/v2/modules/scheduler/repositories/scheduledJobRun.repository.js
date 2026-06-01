const { getScheduledJobRunModel } = require('../models/scheduledJobRun.model');

async function createRun(payload) {
  const ScheduledJobRun = getScheduledJobRunModel();
  return ScheduledJobRun.create(payload);
}

async function updateRun(runId, payload) {
  const ScheduledJobRun = getScheduledJobRunModel();
  return ScheduledJobRun.findByIdAndUpdate(runId, { $set: payload }, { returnDocument: 'after' }).exec();
}

async function listRuns({ jobName = null, limit = 50 } = {}) {
  const ScheduledJobRun = getScheduledJobRunModel();
  const query = {};
  if (jobName) query.jobName = jobName;

  return ScheduledJobRun.find(query)
    .sort({ startedAt: -1 })
    .limit(Math.min(Math.max(1, limit), 200))
    .lean();
}

async function findRunById(runId) {
  const ScheduledJobRun = getScheduledJobRunModel();
  return ScheduledJobRun.findById(runId).lean();
}

module.exports = {
  createRun,
  updateRun,
  listRuns,
  findRunById,
};
