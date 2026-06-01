const { AppError } = require('../../../kernel/errors');
const reportErrorCodes = require('../errors/reportErrorCodes');
const userRepository = require('../../users/repositories/user.repository');
const reportTimeEntryRepository = require('../repositories/reportTimeEntry.repository');
const reportTimeQueryService = require('./reportTimeQuery.service');
const { assertCanViewUserReport } = require('../helpers/access.helper');
const {
  groupEntriesByDay,
  groupEntriesByProject,
} = require('../helpers/grouping.helper');
const {
  toReportUserSummary,
  toDateRangeDto,
  toReportTotals,
  toReportEntryDto,
} = require('../dto/report.dto');

async function getUserTimeReport(userId, parsedQuery, req) {
  assertCanViewUserReport(req, userId);

  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('Report user not found', {
      status: 404,
      code: reportErrorCodes.REPORT_USER_NOT_FOUND,
    });
  }

  const entryFilters = await reportTimeQueryService.buildEntryFilters(parsedQuery, { userId });
  const totals = await reportTimeEntryRepository.aggregateEntryTotals(entryFilters);

  const entries = await reportTimeEntryRepository.listAllEntriesForReport(entryFilters);
  const groupedDays = groupEntriesByDay(entries, parsedQuery.dateRange.timeZone);
  const groupedProjects = groupEntriesByProject(entries);

  const response = {
    user: toReportUserSummary(user),
    dateRange: toDateRangeDto(parsedQuery.dateRange),
    statusFilter: parsedQuery.statuses,
    summary: toReportTotals(totals.totalMinutes, totals.totalEntries),
    groupedDays,
    groupedProjects,
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
  getUserTimeReport,
};
