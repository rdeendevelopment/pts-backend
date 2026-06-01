const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { parseTimeReportQuery } = require('../helpers/query.helper');
const userTimeReportService = require('../services/userTimeReport.service');

async function getUserTimeReport(req, res) {
  const userId = assertObjectId(req.params.userId, 'userId');
  const parsedQuery = parseTimeReportQuery(req.query, req);
  const data = await userTimeReportService.getUserTimeReport(userId, parsedQuery, req);
  return sendSuccess(res, data);
}

module.exports = {
  getUserTimeReport: asyncHandler(getUserTimeReport),
};
