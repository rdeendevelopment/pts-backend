const { body, validationResult } = require('express-validator');

const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];

function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const first = result.array()[0];
  return res.status(400).json({
    success: false,
    message: first.msg || 'Invalid request',
    errors: result.array(),
  });
}

const createTaskRules = [
  body('title').trim().notEmpty().withMessage('title is required').isLength({ max: 500 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 100000 }),
  body('priority').optional().isIn(PRIORITIES),
  body('dueDate').optional({ nullable: true }).isString(),
  body('startDate').optional({ nullable: true }).isString(),
  body('statusId').optional({ nullable: true }).isMongoId(),
  body('assigneeIds').optional().isArray(),
  body('assigneeIds.*').optional().isMongoId(),
  body('reviewerId').optional({ nullable: true }).isMongoId(),
  body('labelIds').optional().isArray(),
  body('labelIds.*').optional().isString(),
  body('tags').optional().isArray(),
];

const updateTaskRules = [
  body('title').optional().trim().notEmpty().isLength({ max: 500 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 100000 }),
  body('priority').optional().isIn(PRIORITIES),
  body('dueDate').optional({ nullable: true }),
  body('startDate').optional({ nullable: true }),
  body('assigneeIds').optional().isArray(),
  body('assigneeIds.*').optional().isMongoId(),
  body('reviewerId').optional({ nullable: true }).isMongoId(),
  body('labelIds').optional().isArray(),
  body('tags').optional().isArray(),
  body('checklist').optional().isArray(),
];

const moveTaskRules = [
  body('statusId').trim().notEmpty().withMessage('statusId required').isMongoId(),
];

const addCommentRules = [
  body('text').optional({ nullable: true }).isString().isLength({ max: 50000 }),
  body('mentions').optional().isArray(),
  body('mentions.*').optional().isMongoId(),
  body('parentCommentId').optional({ nullable: true }).isMongoId(),
  body('attachments').optional().isArray({ max: 10 }),
];

const reorderWorkflowRules = [
  body('updates').isArray({ min: 1 }).withMessage('updates array required'),
  body('updates.*.statusId').trim().notEmpty().isMongoId(),
  body('updates.*.order').isNumeric().withMessage('each update needs numeric order'),
];

module.exports = {
  handleValidation,
  createTaskRules,
  updateTaskRules,
  moveTaskRules,
  addCommentRules,
  reorderWorkflowRules,
};
