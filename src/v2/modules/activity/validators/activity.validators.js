const { body, param, query } = require('express-validator');
const {
  WEEK_STATUSES,
  ENTRY_STATUSES,
  ENTRY_SOURCES,
} = require('../constants/activity.constants');

function isValidWeekStatusFilter(value) {
  const statuses = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!statuses.length) throw new Error('Invalid week status');
  if (statuses.includes('all')) {
    if (statuses.length === 1) return true;
    throw new Error('The all status cannot be combined with other statuses');
  }
  if (!statuses.every((status) => WEEK_STATUSES.includes(status))) {
    throw new Error('Invalid week status');
  }
  return true;
}

const weekListRules = [
  query('user_id').optional().isString(),
  query('userId').optional().isString(),
  query('status').optional().custom(isValidWeekStatusFilter),
  query('week_start').optional().isISO8601(),
  query('weekStartDate').optional().isISO8601(),
  query('startDate').optional().isISO8601(),
  query('start_date').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  query('weekStartDateFrom').optional().isISO8601(),
  query('weekStartDateTo').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('search').optional().isString(),
];

const workforceSummaryRules = [
  query('userId').optional().isString(),
  query('user_id').optional().isString(),
  query('status').optional().isIn(WEEK_STATUSES),
  query('startDate').optional().isISO8601(),
  query('start_date').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
];

const weekIdRules = [param('id').isString().notEmpty()];

const weekCreateRules = [
  body('entryDate').optional().isISO8601(),
  body('weekStartDate').optional().isISO8601(),
  body('userId').optional().isString(),
];

const weekRejectRules = [
  ...weekIdRules,
  body('rejectionReason').optional().isString(),
  body('rejection_reason').optional().isString(),
];

const entryListRules = [
  query('time_week_id').optional().isString(),
  query('timeWeekId').optional().isString(),
  query('project_id').optional().isString(),
  query('projectId').optional().isString(),
  query('user_id').optional().isString(),
  query('userId').optional().isString(),
  query('status').optional().isIn(ENTRY_STATUSES),
  query('entryDateFrom').optional().isISO8601(),
  query('entryDateTo').optional().isISO8601(),
];

const entryIdRules = [param('id').isString().notEmpty()];

const entryCreateRules = [
  body('projectId').notEmpty(),
  body('workCategoryId').notEmpty(),
  body('minutes').isInt({ min: 1 }),
  body('entryDate').optional().isISO8601(),
  body('source').optional().isIn(ENTRY_SOURCES),
  body('budgetId').optional().isString(),
  body('timeWeekId').optional().isString(),
  body('title').optional().isString(),
  body('description').optional().isString(),
];

const entryUpdateRules = [
  ...entryIdRules,
  body('minutes').optional().isInt({ min: 1 }),
  body('entryDate').optional().isISO8601(),
  body('workCategoryId').optional().isString(),
  body('budgetId').optional().isString(),
];

const validatePreviewRules = [
  body('projectId').notEmpty(),
  body('workCategoryId').notEmpty(),
  body('minutes').optional().isInt({ min: 0 }),
  body('entryDate').optional().isISO8601(),
  body('budgetId').optional().isString(),
  body('source').optional().isIn(ENTRY_SOURCES),
];

const timerStartRules = [
  body('projectId').notEmpty(),
  body('workCategoryId').notEmpty(),
  body('budgetId').optional().isString(),
  body('description').optional().isString(),
];

const timerIdRules = [param('id').isString().notEmpty()];
const timerCorrectionRules = [
  ...timerIdRules,
  body('endTime').isISO8601(),
  body('description').optional().isString(),
];

const projectIdRules = [param('projectId').isString().notEmpty()];

const projectSummaryRules = [
  ...projectIdRules,
  query('userId').optional().isString(),
  query('user_id').optional().isString(),
  query('startDate').optional().isISO8601(),
  query('start_date').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  query('weekLimit').optional().isInt({ min: 1, max: 52 }),
  query('week_limit').optional().isInt({ min: 1, max: 52 }),
];

const projectWeeklyRules = [
  ...projectIdRules,
  query('weekStartDate').optional().isISO8601(),
  query('week_start').optional().isISO8601(),
  query('weekEnding').optional().isISO8601(),
  query('week_ending').optional().isISO8601(),
  query('userId').optional().isString(),
  query('user_id').optional().isString(),
  query('status').optional().isIn(ENTRY_STATUSES),
];

const projectTimeEntriesRules = [
  ...projectIdRules,
  query('userId').optional().isString(),
  query('user_id').optional().isString(),
  query('startDate').optional().isISO8601(),
  query('start_date').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
  query('entryDateFrom').optional().isISO8601(),
  query('entryDateTo').optional().isISO8601(),
  query('status').optional().isIn(ENTRY_STATUSES),
  query('limit').optional().isInt({ min: 1, max: 200 }),
];

const notifyMissingWeekRules = [
  body('userId').notEmpty(),
  body('user_id').optional().isString(),
  body('weekStartDate').notEmpty().isISO8601(),
  body('week_start_date').optional().isISO8601(),
  body('message').optional().isString(),
];

module.exports = {
  weekListRules,
  weekIdRules,
  weekCreateRules,
  weekRejectRules,
  entryListRules,
  entryIdRules,
  entryCreateRules,
  entryUpdateRules,
  validatePreviewRules,
  timerStartRules,
  timerIdRules,
  timerCorrectionRules,
  projectIdParamRules: projectIdRules,
  projectSummaryRules,
  projectWeeklyRules,
  projectTimeEntriesRules,
  workforceSummaryRules,
  notifyMissingWeekRules,
};
