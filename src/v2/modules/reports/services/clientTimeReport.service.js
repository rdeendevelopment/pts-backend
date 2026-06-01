const { AppError } = require('../../../kernel/errors');
const reportErrorCodes = require('../errors/reportErrorCodes');
const clientRepository = require('../../clients/repositories/client.repository');
const projectRepository = require('../../projects/repositories/project.repository');
const reportTimeEntryRepository = require('../repositories/reportTimeEntry.repository');
const reportTimeQueryService = require('./reportTimeQuery.service');
const { assertCanViewManagerReport } = require('../helpers/access.helper');
const { minutesToHours } = require('../helpers/formatting.helper');
const {
  toReportClientSummary,
  toReportProjectSummary,
  toDateRangeDto,
  toReportTotals,
} = require('../dto/report.dto');

async function getClientTimeReport(clientId, parsedQuery, req) {
  assertCanViewManagerReport(req);

  const client = await clientRepository.findById(clientId);
  if (!client) {
    throw new AppError('Report client not found', {
      status: 404,
      code: reportErrorCodes.REPORT_CLIENT_NOT_FOUND,
    });
  }

  const { items: projects } = await projectRepository.listProjects(
    { clientId },
    { limit: 500 }
  );

  const entryFilters = await reportTimeQueryService.buildEntryFilters(parsedQuery, { clientId });
  const totals = await reportTimeEntryRepository.aggregateEntryTotals(entryFilters);

  const groupedProjects = [];
  for (const project of projects) {
    const projectFilters = {
      ...entryFilters,
      projectId: project._id,
      projectIds: undefined,
    };
    const projectTotals = await reportTimeEntryRepository.aggregateEntryTotals(projectFilters);
    groupedProjects.push({
      project: toReportProjectSummary(project),
      totalMinutes: projectTotals.totalMinutes,
      totalHours: minutesToHours(projectTotals.totalMinutes),
      totalEntries: projectTotals.totalEntries,
    });
  }

  groupedProjects.sort((a, b) => b.totalMinutes - a.totalMinutes);

  return {
    client: toReportClientSummary(client),
    dateRange: toDateRangeDto(parsedQuery.dateRange),
    statusFilter: parsedQuery.statuses,
    summary: toReportTotals(totals.totalMinutes, totals.totalEntries),
    groupedProjects,
  };
}

module.exports = {
  getClientTimeReport,
};
