const { body, param, query } = require('express-validator');
const { MODULE_CATEGORIES, MODULE_STATUSES } = require('../constants/module.constants');

const listRules = [
  query('include_deleted').optional().isIn(['true', 'false']).withMessage('include_deleted must be true or false'),
];

const idParamRules = [
  param('id').isString().notEmpty().withMessage('Module id is required'),
];

const createRules = [
  body('key').trim().notEmpty().withMessage('Module key is required'),
  body('name').trim().notEmpty().withMessage('Module name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('category').isIn(MODULE_CATEGORIES).withMessage(`Category must be one of: ${MODULE_CATEGORIES.join(', ')}`),
  body('status').optional().isIn(MODULE_STATUSES).withMessage(`Status must be one of: ${MODULE_STATUSES.join(', ')}`),
  body('sortOrder').optional().isNumeric().withMessage('sortOrder must be numeric'),
  body('sort_order').optional().isNumeric().withMessage('sort_order must be numeric'),
  body('icon').optional().isString().withMessage('icon must be a string'),
  body('routeBase').optional().isString().withMessage('routeBase must be a string'),
  body('route_base').optional().isString().withMessage('route_base must be a string'),
];

const updateRules = [
  ...idParamRules,
  body('name').optional().trim().notEmpty().withMessage('Module name cannot be empty'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('category').optional().isIn(MODULE_CATEGORIES).withMessage(`Category must be one of: ${MODULE_CATEGORIES.join(', ')}`),
  body('status').optional().isIn(MODULE_STATUSES).withMessage(`Status must be one of: ${MODULE_STATUSES.join(', ')}`),
  body('sortOrder').optional().isNumeric().withMessage('sortOrder must be numeric'),
  body('sort_order').optional().isNumeric().withMessage('sort_order must be numeric'),
  body('icon').optional().isString().withMessage('icon must be a string'),
  body('routeBase').optional().isString().withMessage('routeBase must be a string'),
  body('route_base').optional().isString().withMessage('route_base must be a string'),
];

module.exports = {
  listRules,
  idParamRules,
  createRules,
  updateRules,
};
