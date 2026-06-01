const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { parseTimeReportQuery } = require('../helpers/query.helper');
const clientTimeReportService = require('../services/clientTimeReport.service');

async function getClientTimeReport(req, res) {
  const clientId = assertObjectId(req.params.clientId, 'clientId');
  const parsedQuery = parseTimeReportQuery(req.query, req);
  const data = await clientTimeReportService.getClientTimeReport(clientId, parsedQuery, req);
  return sendSuccess(res, data);
}

module.exports = {
  getClientTimeReport: asyncHandler(getClientTimeReport),
};
