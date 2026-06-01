const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { parseTimeReportQuery } = require('../helpers/query.helper');
const projectTimeReportService = require('../services/projectTimeReport.service');

async function getProjectTimeReport(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const parsedQuery = parseTimeReportQuery(req.query, req);
  const data = await projectTimeReportService.getProjectTimeReport(projectId, parsedQuery, req);
  return sendSuccess(res, data);
}

module.exports = {
  getProjectTimeReport: asyncHandler(getProjectTimeReport),
};
