const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const schedulerService = require('../services/scheduler.service');
const { executeRetainerRenewalJob } = require('../../../scheduler');

async function listJobs(_req, res) {
  const items = await schedulerService.listJobDefinitions();
  return sendSuccess(res, { items });
}

async function listRuns(req, res) {
  const items = await schedulerService.listJobRuns(req.query);
  return sendSuccess(res, { items });
}

async function getRun(req, res) {
  const runId = assertObjectId(req.params.runId, 'runId');
  const item = await schedulerService.getJobRunById(runId);
  return sendSuccess(res, { item });
}

async function triggerRetainerRenewal(_req, res) {
  const result = await executeRetainerRenewalJob('manual');
  return sendSuccess(res, { result });
}

module.exports = {
  listJobs: asyncHandler(listJobs),
  listRuns: asyncHandler(listRuns),
  getRun: asyncHandler(getRun),
  triggerRetainerRenewal: asyncHandler(triggerRetainerRenewal),
};
