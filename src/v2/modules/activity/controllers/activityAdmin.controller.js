const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const activityAdminService = require('../services/activityAdmin.service');

async function getWorkforceSummary(req, res) {
  const data = await activityAdminService.getWorkforceSummary(req.query, req);
  return sendSuccess(res, data);
}

async function notifyMissingWeek(req, res) {
  const data = await activityAdminService.notifyMissingWeek(req.body, req.v2Auth.accountId);
  return sendSuccess(res, data);
}

module.exports = {
  getWorkforceSummary: asyncHandler(getWorkforceSummary),
  notifyMissingWeek: asyncHandler(notifyMissingWeek),
};
