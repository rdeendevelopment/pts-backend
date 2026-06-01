const { AppError } = require('../../../kernel/errors');
const reportErrorCodes = require('../errors/reportErrorCodes');
const projectRepository = require('../../projects/repositories/project.repository');
const clientRepository = require('../../clients/repositories/client.repository');
const projectsModule = require('../../projects');
const reportTimeEntryRepository = require('../repositories/reportTimeEntry.repository');
const reportTimeQueryService = require('./reportTimeQuery.service');
const { assertCanViewManagerReport } = require('../helpers/access.helper');
const {
  groupEntriesByDay,
  groupEntriesByUser,
} = require('../helpers/grouping.helper');
const { minutesToHours } = require('../helpers/formatting.helper');
const {
  toReportProjectSummary,
  toReportClientSummary,
  toDateRangeDto,
  toReportTotals,
  toReportEntryDto,
} = require('../dto/report.dto');

async function getProjectTimeReport(projectId, parsedQuery, req) {
  assertCanViewManagerReport(req);

  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new AppError('Report project not found', {
      status: 404,
      code: reportErrorCodes.REPORT_PROJECT_NOT_FOUND,
    });
  }

  const client = await clientRepository.findById(project.clientId);
  const stats = await projectsModule.getProjectStats(projectId);

  const entryFilters = await reportTimeQueryService.buildEntryFilters(parsedQuery, {
    projectId,
  });
  const totals = await reportTimeEntryRepository.aggregateEntryTotals(entryFilters);
  const entries = await reportTimeEntryRepository.listAllEntriesForReport(entryFilters);

  const response = {
    project: toReportProjectSummary(project),
    client: client ? toReportClientSummary(client) : { id: String(project.clientId) },
    dateRange: toDateRangeDto(parsedQuery.dateRange),
    statusFilter: parsedQuery.statuses,
    capacity: {
      approvedBudgetMinutes: stats?.totalApprovedMinutes || 0,
      assignedMinutes: stats?.totalAssignedMinutes || 0,
      consumedMinutes: stats?.totalConsumedMinutes || 0,
      remainingMinutes: stats?.totalRemainingMinutes || 0,
      approvedBudgetHours: minutesToHours(stats?.totalApprovedMinutes || 0),
      assignedHours: minutesToHours(stats?.totalAssignedMinutes || 0),
      consumedHours: minutesToHours(stats?.totalConsumedMinutes || 0),
      remainingHours: minutesToHours(stats?.totalRemainingMinutes || 0),
    },
    summary: toReportTotals(totals.totalMinutes, totals.totalEntries),
    groupedDays: groupEntriesByDay(entries, parsedQuery.dateRange.timeZone),
    groupedUsers: groupEntriesByUser(entries, parsedQuery.dateRange.timeZone),
  };

  if (parsedQuery.includeEntries) {
    const { items, total } = await reportTimeEntryRepository.listEntriesForReport(
      entryFilters,
      parsedQuery.pagination
    );
    response.entries = {
      items: items.map(toReportEntryDto),
      pagination: {
        page: parsedQuery.pagination.page,
        limit: parsedQuery.pagination.limit,
        total,
        totalPages: Math.ceil(total / parsedQuery.pagination.limit) || 0,
      },
    };
  }

  return response;
}

module.exports = {
  getProjectTimeReport,
};
