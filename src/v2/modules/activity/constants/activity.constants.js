const WEEK_STATUSES = ['draft', 'submitted', 'approved', 'rejected'];
const ENTRY_STATUSES = ['draft', 'submitted', 'approved', 'rejected'];
const ENTRY_SOURCES = ['manual', 'timer'];
const TIMER_STATUSES = ['running', 'paused', 'needs_correction', 'stopped', 'cancelled', 'discarded'];
const WORK_CATEGORY_STATUSES = ['active', 'inactive'];

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const MAX_TIMER_MINUTES = 480; // 8 hours per timer session

const WEEK_START_DAYS = ['monday', 'sunday'];

const DEFAULT_WORK_CATEGORIES = [
  { code: 'development', name: 'Development', sortOrder: 1, isDefault: true },
  { code: 'backend', name: 'Backend', sortOrder: 2 },
  { code: 'frontend', name: 'Frontend', sortOrder: 3 },
  { code: 'meeting', name: 'Meeting', sortOrder: 4 },
  { code: 'marketing', name: 'Marketing', sortOrder: 5 },
  { code: 'qa', name: 'QA', sortOrder: 6 },
  { code: 'design', name: 'Design', sortOrder: 7 },
  { code: 'support', name: 'Support', sortOrder: 8 },
  { code: 'devops', name: 'DevOps', sortOrder: 9 },
];

const CAP_PERIODS = ['project', 'day', 'week', 'month'];

module.exports = {
  WEEK_STATUSES,
  ENTRY_STATUSES,
  ENTRY_SOURCES,
  TIMER_STATUSES,
  WORK_CATEGORY_STATUSES,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  MAX_TIMER_MINUTES,
  WEEK_START_DAYS,
  DEFAULT_WORK_CATEGORIES,
  CAP_PERIODS,
};
