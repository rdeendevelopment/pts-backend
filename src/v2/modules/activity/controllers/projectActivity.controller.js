const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectActivityReportService = require('../services/projectActivityReport.service');

async function getProjectSummary(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await projectActivityReportService.getProjectSummary(projectId, req.query, req);
  return sendSuccess(res, data);
}

async function getProjectWeeklyActivity(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await projectActivityReportService.getProjectWeeklyActivity(projectId, req.query, req);
  return sendSuccess(res, data);
}

async function listProjectTimeEntries(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const items = await projectActivityReportService.listProjectTimeEntries(projectId, req.query, req);
  return sendSuccess(res, { items });
}

async function listProjectBudgets(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const items = await projectActivityReportService.listProjectBudgetsForActivity(projectId, req);
  return sendSuccess(res, { items });
}

module.exports = {
  getProjectSummary: asyncHandler(getProjectSummary),
  getProjectWeeklyActivity: asyncHandler(getProjectWeeklyActivity),
  listProjectTimeEntries: asyncHandler(listProjectTimeEntries),
  listProjectBudgets: asyncHandler(listProjectBudgets),
};
