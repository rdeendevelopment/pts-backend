const { body, param, query } = require('express-validator');
const { TASK_PRIORITIES, TASK_STATUSES, WORKFLOW_STATUS_CATEGORIES, TASK_MEMBER_ROLES } = require('../constants/tasks.constants');
const { MAX_AGGREGATE_LIMIT } = require('../helpers/taskAggregateQuery.helper');

const projectIdRules = [
  param('projectId').isString().notEmpty().withMessage('projectId is required'),
];

const taskIdRules = [
  param('taskId').isString().notEmpty().withMessage('taskId is required'),
];

const createTaskRules = [
  ...projectIdRules,
  body('title').trim().notEmpty().withMessage('title is required'),
  body('priority').optional().isIn(TASK_PRIORITIES),
  body('assigneeIds').optional().isArray(),
  body('workflowStatusId').optional().isString(),
  body('statusId').optional().isString(),
];

const updateTaskRules = [
  ...taskIdRules,
  body('title').optional().trim().notEmpty(),
  body('priority').optional().isIn(TASK_PRIORITIES),
  body('assigneeIds').optional().isArray(),
  body('attachments').optional().isArray(),
  body('checklist').optional().isArray(),
];

const moveTaskRules = [
  ...taskIdRules,
  body('workflowStatusId').optional().isString(),
  body('statusId').optional().isString(),
];

const createCommentRules = [
  ...taskIdRules,
  body('content').optional().isString(),
  body('text').optional().isString(),
  body('mentions').optional().isArray(),
  body('attachments').optional().isArray(),
  body('parentCommentId').optional().isString(),
];

const aggregateQueryRules = [
  query('projectId').optional().isString().notEmpty(),
  query('status').optional().isIn(TASK_STATUSES),
  query('priority').optional().isIn(TASK_PRIORITIES),
  query('dueDateFrom').optional().isISO8601().toDate(),
  query('dueDateTo').optional().isISO8601().toDate(),
  query('dueDateStart').optional().isISO8601().toDate(),
  query('dueDateEnd').optional().isISO8601().toDate(),
  query('search').optional().isString(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: MAX_AGGREGATE_LIMIT }).toInt(),
];

const notificationQueryRules = [
  query('userId').optional().isString().notEmpty(),
  query('unread').optional().isIn(['true', 'false', '1', '0']),
  query('isRead').optional().isIn(['true', 'false']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: MAX_AGGREGATE_LIMIT }).toInt(),
];

const reportsQueryRules = [
  query('projectId').optional().isString().notEmpty(),
];

const notificationIdRules = [
  param('id').isString().notEmpty().withMessage('notification id is required'),
];

const attachmentIdRules = [
  param('attachmentId').isString().notEmpty().withMessage('attachmentId is required'),
];

const statusIdRules = [
  param('statusId').isString().notEmpty().withMessage('statusId is required'),
];

const updateProjectSettingsRules = [
  ...projectIdRules,
  body('name').optional().trim().notEmpty(),
  body('description').optional().isString(),
];

const createWorkflowStatusRules = [
  ...projectIdRules,
  body('name').trim().notEmpty().withMessage('name is required'),
  body('color').optional().isString(),
  body('icon').optional({ nullable: true }).isString(),
  body('category').optional().isIn(WORKFLOW_STATUS_CATEGORIES),
  body('isTerminal').optional().isBoolean(),
];

const updateWorkflowStatusRules = [
  ...projectIdRules,
  ...statusIdRules,
  body('name').optional().trim().notEmpty(),
  body('color').optional().isString(),
  body('icon').optional({ nullable: true }).isString(),
  body('category').optional().isIn(WORKFLOW_STATUS_CATEGORIES),
  body('isTerminal').optional().isBoolean(),
];

const reorderWorkflowStatusesRules = [
  ...projectIdRules,
  body('updates').isArray({ min: 1 }).withMessage('updates must be a non-empty array'),
  body('updates.*.statusId').isString().notEmpty(),
  body('updates.*.order').isNumeric(),
];

const archiveWorkflowStatusRules = [
  ...projectIdRules,
  ...statusIdRules,
  body('replacementStatusId').optional().isString().notEmpty(),
];

const memberIdRules = [
  param('memberId').isString().notEmpty().withMessage('memberId is required'),
];

const addProjectMemberRules = [
  ...projectIdRules,
  body('email').optional().isEmail().withMessage('email must be valid'),
  body('userId').optional().isString().notEmpty(),
  body('role').optional().isIn(TASK_MEMBER_ROLES),
  body().custom((_, { req }) => {
    if (!req.body?.email && !req.body?.userId) {
      throw new Error('email or userId is required');
    }
    return true;
  }),
];

const updateProjectMemberRules = [
  ...projectIdRules,
  ...memberIdRules,
  body('role').isIn(TASK_MEMBER_ROLES).withMessage('role is required'),
];

const collaboratorUserIdRules = [
  param('userId').isString().notEmpty().withMessage('userId is required'),
];

const addCollaboratorRules = [
  ...taskIdRules,
  body('email').optional().isEmail().withMessage('email must be valid'),
  body('userId').optional().isString().notEmpty(),
  body('accessType').optional().isIn(['comment', 'review', 'edit']),
  body().custom((_, { req }) => {
    if (!req.body?.email && !req.body?.userId) {
      throw new Error('email or userId is required');
    }
    return true;
  }),
];

module.exports = {
  projectIdRules,
  taskIdRules,
  createTaskRules,
  updateTaskRules,
  moveTaskRules,
  createCommentRules,
  aggregateQueryRules,
  notificationQueryRules,
  reportsQueryRules,
  notificationIdRules,
  attachmentIdRules,
  statusIdRules,
  updateProjectSettingsRules,
  createWorkflowStatusRules,
  updateWorkflowStatusRules,
  reorderWorkflowStatusesRules,
  archiveWorkflowStatusRules,
  memberIdRules,
  addProjectMemberRules,
  updateProjectMemberRules,
  addCollaboratorRules,
  collaboratorUserIdRules,
};
