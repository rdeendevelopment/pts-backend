const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { parseTimeReportQuery } = require('../helpers/query.helper');
const teamTimeReportService = require('../services/teamTimeReport.service');

async function getTeamTimeReport(req, res) {
  const parsedQuery = parseTimeReportQuery(req.query, req);
  const data = await teamTimeReportService.getTeamTimeReport(parsedQuery, req);
  return sendSuccess(res, data);
}

module.exports = {
  getTeamTimeReport: asyncHandler(getTeamTimeReport),
};
