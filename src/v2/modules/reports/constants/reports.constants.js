const REPORT_PERIODS = ['daily', 'weekly', 'bi_weekly', 'monthly', 'custom'];
const REPORT_ENTRY_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'all'];

const DEFAULT_MANAGER_STATUS_FILTER = ['submitted', 'approved'];
const DEFAULT_SELF_STATUS_FILTER = ['draft', 'submitted', 'approved', 'rejected'];

const DEFAULT_ENTRY_PAGE = 1;
const DEFAULT_ENTRY_LIMIT = 50;
const MAX_ENTRY_LIMIT = 200;

module.exports = {
  REPORT_PERIODS,
  REPORT_ENTRY_STATUSES,
  DEFAULT_MANAGER_STATUS_FILTER,
  DEFAULT_SELF_STATUS_FILTER,
  DEFAULT_ENTRY_PAGE,
  DEFAULT_ENTRY_LIMIT,
  MAX_ENTRY_LIMIT,
};
