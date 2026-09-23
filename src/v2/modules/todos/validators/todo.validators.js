const { body, param, query } = require('express-validator');
const objectId = /^[a-f\d]{24}$/i;

const idRule = param('id').matches(objectId).withMessage('id must be a valid ObjectId');
const createRules = [
  body('title').isString().trim().notEmpty().isLength({ max: 300 }),
  body('priority').optional().isIn(['high', 'medium', 'low']),
  body('todoDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  body('projectId').optional({ nullable: true }).matches(objectId),
  body('linkedTaskId').optional({ nullable: true }).matches(objectId),
  body('deadline').optional({ nullable: true }).isISO8601(),
  body('reminderAt').optional({ nullable: true }).isISO8601(),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 5000 }),
];
const updateRules = [
  idRule,
  body('title').optional().isString().trim().notEmpty().isLength({ max: 300 }),
  body('priority').optional().isIn(['high', 'medium', 'low']),
  body('todoDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  body('projectId').optional({ nullable: true }).matches(objectId),
  body('linkedTaskId').optional({ nullable: true }).matches(objectId),
  body('deadline').optional({ nullable: true }).isISO8601(),
  body('reminderAt').optional({ nullable: true }).isISO8601(),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 5000 }),
];
const listRules = [
  query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  query('status').optional().isIn(['pending', 'completed', 'overdue']),
  query('priority').optional().isIn(['high', 'medium', 'low']),
  query('sort').optional().isIn(['priority', 'deadline', 'newest', 'oldest', 'project']),
  query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 }),
];
const reportRules = [
  query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  query('period').optional().isIn(['daily', 'weekly', 'monthly']),
];

const availableTaskRules = [
  query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  query('search').optional().isString().isLength({ max: 200 }),
  query('projectId').optional().matches(objectId),
  query('priority').optional().isIn(['none', 'low', 'medium', 'high', 'urgent']),
  query('workflowStatusId').optional().matches(objectId),
  query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 }),
];

const addTasksRules = [
  body('taskIds').isArray({ min: 1, max: 100 }), body('taskIds.*').matches(objectId),
  body('todoDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
];

const completionRules = [idRule, body('completionMode').optional().isIn(['my_day_only', 'my_day_and_task'])];

module.exports = { createRules, updateRules, listRules, reportRules, availableTaskRules, addTasksRules, completionRules, idRules: [idRule] };
