const { buildDateRange } = require('./dateRange.helper');
const { normalizeReportStatusFilter } = require('./statusFilter.helper');
const { canManageReports } = require('./access.helper');
const {
  DEFAULT_ENTRY_PAGE,
  DEFAULT_ENTRY_LIMIT,
  MAX_ENTRY_LIMIT,
} = require('../constants/reports.constants');

function parsePagination(query = {}) {
  const page = Math.max(1, Number(query.page || DEFAULT_ENTRY_PAGE));
  const limit = Math.min(
    MAX_ENTRY_LIMIT,
    Math.max(1, Number(query.limit || DEFAULT_ENTRY_LIMIT))
  );
  return { page, limit, skip: (page - 1) * limit };
}

function parseTimeReportQuery(query = {}, req) {
  const dateRange = buildDateRange({
    period: query.period,
    startDate: query.startDate || query.start_date,
    endDate: query.endDate || query.end_date,
    anchorDate: query.anchorDate || query.anchor_date || new Date(),
  });

  const statusFilter = normalizeReportStatusFilter(query.status, {
    canManageReports: canManageReports(req),
  });

  const includeEntries = query.includeEntries === 'true'
    || query.include_entries === 'true';

  return {
    dateRange,
    statuses: statusFilter.statuses,
    statusFilterExplicit: statusFilter.explicit,
    projectId: query.projectId || query.project_id || null,
    clientId: query.clientId || query.client_id || null,
    workCategoryId: query.workCategoryId || query.work_category_id || null,
    taskId: query.taskId || query.task_id || null,
    includeEntries,
    pagination: parsePagination(query),
  };
}

function parseWeekApprovalQuery(query = {}, req) {
  return {
    userId: query.userId || query.user_id || null,
    status: query.status || null,
    weekStartDate: query.weekStartDate || query.week_start || query.week_start_date || null,
    startDate: query.startDate || query.start_date || null,
    endDate: query.endDate || query.end_date || null,
    canManageReports: canManageReports(req),
  };
}

module.exports = {
  parseTimeReportQuery,
  parseWeekApprovalQuery,
  parsePagination,
};
