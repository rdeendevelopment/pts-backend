const reportTimeEntryRepository = require('../repositories/reportTimeEntry.repository');
const reportTimeQueryService = require('./reportTimeQuery.service');
const { assertCanViewManagerReport } = require('../helpers/access.helper');
const { groupEntriesByUser } = require('../helpers/grouping.helper');
const {
  toDateRangeDto,
  toReportTotals,
  toReportEntryDto,
} = require('../dto/report.dto');

async function getTeamTimeReport(parsedQuery, req) {
  assertCanViewManagerReport(req);

  const entryFilters = await reportTimeQueryService.buildEntryFilters(parsedQuery);
  const totals = await reportTimeEntryRepository.aggregateEntryTotals(entryFilters);
  const entries = await reportTimeEntryRepository.listAllEntriesForReport(entryFilters);
  const groupedUsers = groupEntriesByUser(entries, parsedQuery.dateRange.timeZone);

  const response = {
    dateRange: toDateRangeDto(parsedQuery.dateRange),
    statusFilter: parsedQuery.statuses,
    summary: toReportTotals(totals.totalMinutes, totals.totalEntries),
    groupedUsers,
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
  getTeamTimeReport,
};
