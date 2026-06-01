const { body, param, query } = require('express-validator');
const {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  PROJECT_PRIORITIES,
  BILLING_TYPES,
  BUDGET_ENTRY_TYPES,
  BUDGET_APPROVAL_STATUSES,
  BUDGET_SOURCE_TYPES,
  BUDGET_TYPES,
  BUDGET_STATUSES,
  ASSIGNMENT_ROLES,
  ASSIGNMENT_STATUSES,
  CAP_PERIODS,
  MAX_LIST_LIMIT,
} = require('../constants/project.constants');

const listRules = [
  query('search').optional().isString().withMessage('search must be a string'),
  query('client_id').optional().isString().withMessage('client_id must be a string'),
  query('clientId').optional().isString().withMessage('clientId must be a string'),
  query('status').optional().isIn(PROJECT_STATUSES).withMessage(`status must be one of: ${PROJECT_STATUSES.join(', ')}`),
  query('type').optional().isIn(PROJECT_TYPES).withMessage(`type must be one of: ${PROJECT_TYPES.join(', ')}`),
  query('billing_type').optional().isIn(BILLING_TYPES).withMessage(`billing_type must be one of: ${BILLING_TYPES.join(', ')}`),
  query('billingType').optional().isIn(BILLING_TYPES).withMessage(`billingType must be one of: ${BILLING_TYPES.join(', ')}`),
  query('priority').optional().isIn(PROJECT_PRIORITIES).withMessage(`priority must be one of: ${PROJECT_PRIORITIES.join(', ')}`),
  query('tag').optional().isString().withMessage('tag must be a string'),
  query('assigned_user_id').optional().isString().withMessage('assigned_user_id must be a string'),
  query('assignedUserId').optional().isString().withMessage('assignedUserId must be a string'),
  query('loggable_only').optional().isIn(['true', 'false']).withMessage('loggable_only must be true or false'),
  query('loggableOnly').optional().isIn(['true', 'false']).withMessage('loggableOnly must be true or false'),
  query('include_deleted').optional().isIn(['true', 'false']).withMessage('include_deleted must be true or false'),
  query('cursor').optional().isString().withMessage('cursor must be a string'),
  query('limit').optional().isInt({ min: 1, max: MAX_LIST_LIMIT }).withMessage(`limit must be between 1 and ${MAX_LIST_LIMIT}`),
];

const idParamRules = [
  param('id').isString().notEmpty().withMessage('Project id is required'),
];

const projectIdParamRules = [
  param('projectId').isString().notEmpty().withMessage('Project id is required'),
];

const createRules = [
  body('name').trim().notEmpty().withMessage('Project name is required'),
  body('clientId').notEmpty().withMessage('clientId is required'),
  body('code').optional({ nullable: true }).isString().withMessage('code must be a string'),
  body('type').optional().isIn(PROJECT_TYPES).withMessage(`type must be one of: ${PROJECT_TYPES.join(', ')}`),
  body('status').optional().isIn(PROJECT_STATUSES).withMessage(`status must be one of: ${PROJECT_STATUSES.join(', ')}`),
  body('priority').optional().isIn(PROJECT_PRIORITIES).withMessage(`priority must be one of: ${PROJECT_PRIORITIES.join(', ')}`),
  body('billingType').optional().isIn(BILLING_TYPES).withMessage(`billingType must be one of: ${BILLING_TYPES.join(', ')}`),
  body('tags').optional().isArray().withMessage('tags must be an array'),
  body('initialBudget.title').optional().isString().withMessage('initialBudget.title must be a string'),
  body('initialBudget.budgetType').optional().isIn(BUDGET_TYPES).withMessage(`initialBudget.budgetType must be one of: ${BUDGET_TYPES.join(', ')}`),
  body('initialBudget.requestedAmount').optional().isFloat({ min: 0 }).withMessage('initialBudget.requestedAmount must be >= 0'),
  body('initialBudget.approvedAmount').optional().isFloat({ min: 0 }).withMessage('initialBudget.approvedAmount must be >= 0'),
  body('initialBudget.requestedMinutes').optional().isFloat({ min: 0 }).withMessage('initialBudget.requestedMinutes must be >= 0'),
  body('initialBudget.approvedMinutes').optional().isFloat({ min: 0 }).withMessage('initialBudget.approvedMinutes must be >= 0'),
  body('retainerHoursPerMonth').optional().isFloat({ min: 1 }).withMessage('retainerHoursPerMonth must be >= 1'),
  body('retainerRenewalDay').optional().isInt({ min: 1, max: 28 }).withMessage('retainerRenewalDay must be between 1 and 28'),
  body('autoCreateMonthlyBudget').optional().isBoolean().withMessage('autoCreateMonthlyBudget must be a boolean'),
];

const updateRules = [
  ...idParamRules,
  body('name').optional().trim().notEmpty().withMessage('Project name cannot be empty'),
  body('clientId').optional().notEmpty().withMessage('clientId cannot be empty'),
  body('type').optional().isIn(PROJECT_TYPES).withMessage(`type must be one of: ${PROJECT_TYPES.join(', ')}`),
  body('priority').optional().isIn(PROJECT_PRIORITIES).withMessage(`priority must be one of: ${PROJECT_PRIORITIES.join(', ')}`),
  body('billingType').optional().isIn(BILLING_TYPES).withMessage(`billingType must be one of: ${BILLING_TYPES.join(', ')}`),
  body('tags').optional().isArray().withMessage('tags must be an array'),
  body('retainerHoursPerMonth').optional().isFloat({ min: 1 }).withMessage('retainerHoursPerMonth must be >= 1'),
  body('retainerRenewalDay').optional().isInt({ min: 1, max: 28 }).withMessage('retainerRenewalDay must be between 1 and 28'),
  body('autoCreateMonthlyBudget').optional().isBoolean().withMessage('autoCreateMonthlyBudget must be a boolean'),
];

const permanentDeleteRules = [
  ...idParamRules,
  body('password').trim().notEmpty().withMessage('password is required'),
  body('confirm').optional().isBoolean().withMessage('confirm must be a boolean'),
];

const statusRules = [
  ...idParamRules,
  body('status').isIn(PROJECT_STATUSES).withMessage(`status must be one of: ${PROJECT_STATUSES.join(', ')}`),
];

const budgetCreateRules = [
  ...projectIdParamRules,
  body('title').trim().notEmpty().withMessage('Budget title is required'),
  body('entryType').optional().isIn(BUDGET_ENTRY_TYPES).withMessage(`entryType must be one of: ${BUDGET_ENTRY_TYPES.join(', ')}`),
  body('sourceType').optional().isIn(BUDGET_SOURCE_TYPES).withMessage(`sourceType must be one of: ${BUDGET_SOURCE_TYPES.join(', ')}`),
  body('budgetType').isIn(BUDGET_TYPES).withMessage(`budgetType must be one of: ${BUDGET_TYPES.join(', ')}`),
  body('approvalStatus').optional().isIn(BUDGET_APPROVAL_STATUSES).withMessage(`approvalStatus must be one of: ${BUDGET_APPROVAL_STATUSES.join(', ')}`),
  body('status').optional().isIn(BUDGET_STATUSES).withMessage(`status must be one of: ${BUDGET_STATUSES.join(', ')}`),
  body('requestedAmount').optional().isFloat({ min: 0 }).withMessage('requestedAmount must be >= 0'),
  body('approvedAmount').optional().isFloat({ min: 0 }).withMessage('approvedAmount must be >= 0'),
  body('requestedMinutes').optional().isFloat({ min: 0 }).withMessage('requestedMinutes must be >= 0'),
  body('approvedMinutes').optional().isFloat({ min: 0 }).withMessage('approvedMinutes must be >= 0'),
  body('notes').optional().isString().withMessage('notes must be a string'),
  body().custom((value) => {
    if (!value.entryType && !value.sourceType) {
      throw new Error('entryType is required');
    }
    return true;
  }),
];

const budgetUpdateRules = [
  ...projectIdParamRules,
  param('budgetId').isString().notEmpty().withMessage('Budget id is required'),
  body('title').optional().trim().notEmpty().withMessage('Budget title cannot be empty'),
  body('entryType').optional().isIn(BUDGET_ENTRY_TYPES).withMessage(`entryType must be one of: ${BUDGET_ENTRY_TYPES.join(', ')}`),
  body('sourceType').optional().isIn(BUDGET_SOURCE_TYPES).withMessage(`sourceType must be one of: ${BUDGET_SOURCE_TYPES.join(', ')}`),
  body('budgetType').optional().isIn(BUDGET_TYPES).withMessage(`budgetType must be one of: ${BUDGET_TYPES.join(', ')}`),
  body('approvalStatus').optional().isIn(BUDGET_APPROVAL_STATUSES).withMessage(`approvalStatus must be one of: ${BUDGET_APPROVAL_STATUSES.join(', ')}`),
  body('status').optional().isIn(BUDGET_STATUSES).withMessage(`status must be one of: ${BUDGET_STATUSES.join(', ')}`),
  body('requestedAmount').optional().isFloat({ min: 0 }).withMessage('requestedAmount must be >= 0'),
  body('approvedAmount').optional().isFloat({ min: 0 }).withMessage('approvedAmount must be >= 0'),
  body('requestedMinutes').optional().isFloat({ min: 0 }).withMessage('requestedMinutes must be >= 0'),
  body('approvedMinutes').optional().isFloat({ min: 0 }).withMessage('approvedMinutes must be >= 0'),
  body('notes').optional().isString().withMessage('notes must be a string'),
];

const budgetStatusRules = [
  ...projectIdParamRules,
  param('budgetId').isString().notEmpty().withMessage('Budget id is required'),
  body('approvalStatus').optional().isIn(BUDGET_APPROVAL_STATUSES).withMessage(`approvalStatus must be one of: ${BUDGET_APPROVAL_STATUSES.join(', ')}`),
  body('status').optional().isIn(BUDGET_STATUSES).withMessage(`status must be one of: ${BUDGET_STATUSES.join(', ')}`),
  body().custom((value) => {
    if (!value.approvalStatus && !value.status) {
      throw new Error('approvalStatus is required');
    }
    return true;
  }),
];

const assignmentCreateRules = [
  ...projectIdParamRules,
  body('userId').notEmpty().withMessage('userId is required'),
  body('role').optional().isIn(ASSIGNMENT_ROLES).withMessage(`role must be one of: ${ASSIGNMENT_ROLES.join(', ')}`),
  body('allocation.allocatedMinutes').optional().isFloat({ min: 0 }).withMessage('allocatedMinutes must be >= 0'),
  body('allocation.capPeriod').optional().isIn(CAP_PERIODS).withMessage(`capPeriod must be one of: ${CAP_PERIODS.join(', ')}`),
  body('allocatedMinutes').optional().isFloat({ min: 0 }).withMessage('allocatedMinutes must be >= 0'),
  body('capPeriod').optional().isIn(CAP_PERIODS).withMessage(`capPeriod must be one of: ${CAP_PERIODS.join(', ')}`),
];

const assignmentUpdateRules = [
  ...projectIdParamRules,
  param('assignmentId').isString().notEmpty().withMessage('Assignment id is required'),
  body('role').optional().isIn(ASSIGNMENT_ROLES).withMessage(`role must be one of: ${ASSIGNMENT_ROLES.join(', ')}`),
  body('status').optional().isIn(ASSIGNMENT_STATUSES).withMessage(`status must be one of: ${ASSIGNMENT_STATUSES.join(', ')}`),
  body('allocation.allocatedMinutes').optional().isFloat({ min: 0 }).withMessage('allocatedMinutes must be >= 0'),
  body('allocation.capPeriod').optional().isIn(CAP_PERIODS).withMessage(`capPeriod must be one of: ${CAP_PERIODS.join(', ')}`),
  body('allocatedMinutes').optional().isFloat({ min: 0 }).withMessage('allocatedMinutes must be >= 0'),
  body('capPeriod').optional().isIn(CAP_PERIODS).withMessage(`capPeriod must be one of: ${CAP_PERIODS.join(', ')}`),
];

const fileCreateRules = [
  ...projectIdParamRules,
  body('fileName').optional().trim().notEmpty().withMessage('fileName cannot be empty'),
  body('file_name').optional().trim().notEmpty().withMessage('file_name cannot be empty'),
  body('fileUrl').optional().trim().notEmpty().withMessage('fileUrl cannot be empty'),
  body('file_url').optional().trim().notEmpty().withMessage('file_url cannot be empty'),
];

const fileIdParamRules = [
  ...projectIdParamRules,
  param('fileId').isString().notEmpty().withMessage('File id is required'),
];

const budgetIdParamRules = [
  ...projectIdParamRules,
  param('budgetId').isString().notEmpty().withMessage('Budget id is required'),
];

const assignmentIdParamRules = [
  ...projectIdParamRules,
  param('assignmentId').isString().notEmpty().withMessage('Assignment id is required'),
];

const retainerBudgetEnsureRules = [
  ...projectIdParamRules,
];

module.exports = {
  listRules,
  idParamRules,
  projectIdParamRules,
  createRules,
  updateRules,
  statusRules,
  permanentDeleteRules,
  budgetCreateRules,
  budgetUpdateRules,
  budgetStatusRules,
  retainerBudgetEnsureRules,
  assignmentCreateRules,
  assignmentUpdateRules,
  fileCreateRules,
  fileIdParamRules,
  budgetIdParamRules,
  assignmentIdParamRules,
};
