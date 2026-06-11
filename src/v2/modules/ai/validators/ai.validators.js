const { body, param } = require('express-validator');
const { AI_ACTION_KEYS } = require('../constants/ai-actions.constants');

const runAiRules = [
  body('action').trim().notEmpty().withMessage('action is required')
    .isIn(AI_ACTION_KEYS).withMessage(`action must be one of: ${AI_ACTION_KEYS.join(', ')}`),
  body('source_module').optional().isString().withMessage('source_module must be a string'),
  body('sourceModule').optional().isString().withMessage('sourceModule must be a string'),
  body('source_id').optional().isString().withMessage('source_id must be a string'),
  body('sourceId').optional().isString().withMessage('sourceId must be a string'),
  body('tenant_id').optional().isString().withMessage('tenant_id must be a string'),
  body('tenantId').optional().isString().withMessage('tenantId must be a string'),
  body('input').optional(),
  body('context').optional(),
];

const jobIdParamRules = [
  param('jobId').isString().notEmpty().withMessage('jobId is required'),
];

module.exports = {
  runAiRules,
  jobIdParamRules,
};
