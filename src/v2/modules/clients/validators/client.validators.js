const { body, param, query } = require('express-validator');
const {
  CLIENT_STATUSES,
  CLIENT_TYPES,
  MAX_LIST_LIMIT,
} = require('../constants/clients.constants');

const listRules = [
  query('search').optional().isString().withMessage('search must be a string'),
  query('status').optional().isIn(CLIENT_STATUSES).withMessage(`status must be one of: ${CLIENT_STATUSES.join(', ')}`),
  query('type').optional().isIn(CLIENT_TYPES).withMessage(`type must be one of: ${CLIENT_TYPES.join(', ')}`),
  query('tag').optional().isString().withMessage('tag must be a string'),
  query('industry').optional().isString().withMessage('industry must be a string'),
  query('include_deleted').optional().isIn(['true', 'false']).withMessage('include_deleted must be true or false'),
  query('cursor').optional().isString().withMessage('cursor must be a string'),
  query('limit').optional().isInt({ min: 1, max: MAX_LIST_LIMIT }).withMessage(`limit must be between 1 and ${MAX_LIST_LIMIT}`),
];

const idParamRules = [
  param('id').isString().notEmpty().withMessage('Client id is required'),
];

const emailFields = [
  body('email').optional({ nullable: true }).isEmail().withMessage('Valid client email is required'),
  body('primaryContact.email').optional({ nullable: true }).isEmail().withMessage('Valid primary contact email is required'),
  body('primary_contact.email').optional({ nullable: true }).isEmail().withMessage('Valid primary contact email is required'),
  body('billing.billingEmail').optional({ nullable: true }).isEmail().withMessage('Valid billing email is required'),
  body('billing.billing_email').optional({ nullable: true }).isEmail().withMessage('Valid billing email is required'),
];

const createRules = [
  body('name').trim().notEmpty().withMessage('Client name is required'),
  body('code').optional({ nullable: true }).isString().withMessage('code must be a string'),
  body('type').optional().isIn(CLIENT_TYPES).withMessage(`type must be one of: ${CLIENT_TYPES.join(', ')}`),
  body('status').optional().isIn(CLIENT_STATUSES).withMessage(`status must be one of: ${CLIENT_STATUSES.join(', ')}`),
  body('website').optional({ nullable: true }).isURL().withMessage('website must be a valid URL'),
  body('tags').optional().isArray().withMessage('tags must be an array'),
  ...emailFields,
];

const updateRules = [
  ...idParamRules,
  body('name').optional().trim().notEmpty().withMessage('Client name cannot be empty'),
  body('code').optional({ nullable: true }).isString().withMessage('code must be a string'),
  body('type').optional().isIn(CLIENT_TYPES).withMessage(`type must be one of: ${CLIENT_TYPES.join(', ')}`),
  body('website').optional({ nullable: true }).isURL().withMessage('website must be a valid URL'),
  body('tags').optional().isArray().withMessage('tags must be an array'),
  ...emailFields,
];

const statusRules = [
  ...idParamRules,
  body('status').isIn(CLIENT_STATUSES).withMessage(`status must be one of: ${CLIENT_STATUSES.join(', ')}`),
];

module.exports = {
  listRules,
  idParamRules,
  createRules,
  updateRules,
  statusRules,
};
