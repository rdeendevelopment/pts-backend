const { body, param } = require('express-validator');
const { ROLE_STATUSES } = require('../constants/rbac.constants');

const roleIdParamRules = [
  param('id').isString().notEmpty().withMessage('Role id is required'),
];

const accountIdParamRules = [
  param('accountId').isString().notEmpty().withMessage('Account id is required'),
];

const accountRoleParamRules = [
  param('accountId').isString().notEmpty().withMessage('Account id is required'),
  param('roleId').isString().notEmpty().withMessage('Role id is required'),
];

const createRoleRules = [
  body('key').trim().notEmpty().withMessage('Role key is required'),
  body('name').trim().notEmpty().withMessage('Role name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('status').optional().isIn(ROLE_STATUSES).withMessage(`Status must be one of: ${ROLE_STATUSES.join(', ')}`),
  body('priority').optional().isNumeric().withMessage('Priority must be numeric'),
];

const updateRoleRules = [
  ...roleIdParamRules,
  body('name').optional().trim().notEmpty().withMessage('Role name cannot be empty'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('status').optional().isIn(ROLE_STATUSES).withMessage(`Status must be one of: ${ROLE_STATUSES.join(', ')}`),
  body('priority').optional().isNumeric().withMessage('Priority must be numeric'),
];

const assignAccountRoleRules = [
  ...accountIdParamRules,
  body('roleId').optional().isString().withMessage('roleId must be a string'),
  body('role_id').optional().isString().withMessage('role_id must be a string'),
  body().custom((value) => {
    if (!value.roleId && !value.role_id) {
      throw new Error('roleId is required');
    }
    return true;
  }),
];

module.exports = {
  roleIdParamRules,
  accountIdParamRules,
  accountRoleParamRules,
  createRoleRules,
  updateRoleRules,
  assignAccountRoleRules,
};
