const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { parseWeekApprovalQuery } = require('../helpers/query.helper');
const weekApprovalReportService = require('../services/weekApprovalReport.service');

async function getWeekApprovalReport(req, res) {
  const parsedQuery = parseWeekApprovalQuery(req.query, req);
  const data = await weekApprovalReportService.getWeekApprovalReport(parsedQuery, req);
  return sendSuccess(res, data);
}

module.exports = {
  getWeekApprovalReport: asyncHandler(getWeekApprovalReport),
};
