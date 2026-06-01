const { assertObjectId } = require('../../../kernel/validators/objectId');
const { TASK_STATUSES, TASK_PRIORITIES } = require('../constants/tasks.constants');

const DEFAULT_INBOX_LIMIT = 100;
const DEFAULT_MY_TASKS_LIMIT = 200;
const MAX_AGGREGATE_LIMIT = 200;

function parsePagination(query = {}, { defaultLimit = DEFAULT_INBOX_LIMIT } = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const rawLimit = Number(query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_AGGREGATE_LIMIT)
    : defaultLimit;
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function parseDueDateRange(query = {}) {
  const fromRaw = query.dueDateFrom || query.dueDateStart || query.due_date_from;
  const toRaw = query.dueDateTo || query.dueDateEnd || query.due_date_to;
  const range = {};

  if (fromRaw) {
    const from = new Date(fromRaw);
    if (!Number.isNaN(from.getTime())) range.from = from;
  }
  if (toRaw) {
    const to = new Date(toRaw);
    if (!Number.isNaN(to.getTime())) range.to = to;
  }

  return range;
}

function parseAggregateFilters(query = {}) {
  const filters = {};

  if (query.projectId) {
    filters.projectId = assertObjectId(query.projectId, 'projectId');
  }

  if (query.status && TASK_STATUSES.includes(String(query.status))) {
    filters.status = String(query.status);
  }

  if (query.priority && TASK_PRIORITIES.includes(String(query.priority))) {
    filters.priority = String(query.priority);
  }

  const dueRange = parseDueDateRange(query);
  if (dueRange.from) filters.dueDateFrom = dueRange.from;
  if (dueRange.to) filters.dueDateTo = dueRange.to;

  if (query.search != null && String(query.search).trim()) {
    filters.search = String(query.search).trim();
  }

  return filters;
}

function buildPaginationMeta({ page, limit, total }) {
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
  };
}

module.exports = {
  DEFAULT_INBOX_LIMIT,
  DEFAULT_MY_TASKS_LIMIT,
  MAX_AGGREGATE_LIMIT,
  parsePagination,
  parseDueDateRange,
  parseAggregateFilters,
  buildPaginationMeta,
};
