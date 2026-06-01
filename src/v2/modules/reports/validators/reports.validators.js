const { query } = require('express-validator');
const { REPORT_PERIODS, REPORT_ENTRY_STATUSES } = require('../constants/reports.constants');
const { WEEK_STATUSES } = require('../../activity/constants/activity.constants');

const timeReportQueryRules = [
  query('period').optional().isIn(REPORT_PERIODS).withMessage('period must be daily, weekly, bi_weekly, monthly, or custom'),
  query('startDate').optional().isISO8601().withMessage('startDate must be ISO8601'),
  query('start_date').optional().isISO8601(),
  query('endDate').optional().isISO8601().withMessage('endDate must be ISO8601'),
  query('end_date').optional().isISO8601(),
  query('anchorDate').optional().isISO8601(),
  query('anchor_date').optional().isISO8601(),
  query('status').optional().isIn(REPORT_ENTRY_STATUSES).withMessage('status must be draft, submitted, approved, rejected, or all'),
  query('projectId').optional().isMongoId(),
  query('project_id').optional().isMongoId(),
  query('clientId').optional().isMongoId(),
  query('client_id').optional().isMongoId(),
  query('workCategoryId').optional().isMongoId(),
  query('work_category_id').optional().isMongoId(),
  query('taskId').optional().isMongoId(),
  query('task_id').optional().isMongoId(),
  query('includeEntries').optional().isBoolean().toBoolean(),
  query('include_entries').optional().isBoolean().toBoolean(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
];

const weekApprovalQueryRules = [
  query('userId').optional().isMongoId(),
  query('user_id').optional().isMongoId(),
  query('status').optional().isIn(WEEK_STATUSES),
  query('weekStartDate').optional().isISO8601(),
  query('week_start').optional().isISO8601(),
  query('week_start_date').optional().isISO8601(),
  query('startDate').optional().isISO8601(),
  query('start_date').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('end_date').optional().isISO8601(),
];

module.exports = {
  timeReportQueryRules,
  weekApprovalQueryRules,
};
