const { body, param, query } = require('express-validator');
const {
  CLIENT_CONTACT_STATUSES,
  MAX_LIST_LIMIT,
} = require('../constants/clientContact.constants');

const clientIdParamRules = [
  param('clientId').isString().notEmpty().withMessage('Client id is required'),
];

const contactIdParamRules = [
  param('contactId').isString().notEmpty().withMessage('Client contact id is required'),
];

const listRules = [
  ...clientIdParamRules,
  query('search').optional().isString().withMessage('search must be a string'),
  query('status').optional().isIn(CLIENT_CONTACT_STATUSES).withMessage(`status must be one of: ${CLIENT_CONTACT_STATUSES.join(', ')}`),
  query('is_primary_contact').optional().isIn(['true', 'false']).withMessage('is_primary_contact must be true or false'),
  query('isPrimaryContact').optional().isIn(['true', 'false']).withMessage('isPrimaryContact must be true or false'),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: MAX_LIST_LIMIT }).withMessage(`limit must be between 1 and ${MAX_LIST_LIMIT}`),
  query('sort_by').optional().isString().withMessage('sort_by must be a string'),
  query('sortBy').optional().isString().withMessage('sortBy must be a string'),
  query('sort_order').optional().isIn(['asc', 'desc']).withMessage('sort_order must be asc or desc'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('sortOrder must be asc or desc'),
];

const createRules = [
  ...clientIdParamRules,
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('first_name').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('last_name').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Valid email is required when provided'),
  body('username').optional({ nullable: true, checkFalsy: true }).isString().withMessage('username must be a string'),
  body('user_name').optional({ nullable: true, checkFalsy: true }).isString().withMessage('user_name must be a string'),
  body('userName').optional({ nullable: true, checkFalsy: true }).isString().withMessage('userName must be a string'),
  body('password').optional().isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('accountId').optional().isString().withMessage('accountId must be a string'),
  body('account_id').optional().isString().withMessage('account_id must be a string'),
  body('phone').optional({ nullable: true, checkFalsy: true }).isString().withMessage('phone must be a string'),
  body('jobTitle').optional({ nullable: true, checkFalsy: true }).isString().withMessage('jobTitle must be a string'),
  body('job_title').optional({ nullable: true, checkFalsy: true }).isString().withMessage('job_title must be a string'),
  body('status').optional().isIn(CLIENT_CONTACT_STATUSES).withMessage(`status must be one of: ${CLIENT_CONTACT_STATUSES.join(', ')}`),
  body('isPrimaryContact').optional().isBoolean().withMessage('isPrimaryContact must be a boolean'),
  body('is_primary_contact').optional().isBoolean().withMessage('is_primary_contact must be a boolean'),
  body('notes').optional({ nullable: true }).isString().withMessage('notes must be a string'),
  body().custom((value) => {
    const firstName = value.firstName || value.first_name;
    const lastName = value.lastName || value.last_name;
    if (!firstName || !lastName) {
      throw new Error('firstName and lastName are required');
    }
    if (!value.accountId && !value.account_id && !value.password) {
      throw new Error('password is required when accountId is not provided');
    }
    if (!value.accountId && !value.account_id && !value.email && !value.username && !value.user_name && !value.userName) {
      throw new Error('email or username is required when accountId is not provided');
    }
    return true;
  }),
];

const updateRules = [
  ...contactIdParamRules,
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('first_name').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('last_name').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Valid email is required when provided'),
  body('phone').optional({ nullable: true, checkFalsy: true }).isString().withMessage('phone must be a string'),
  body('jobTitle').optional({ nullable: true, checkFalsy: true }).isString().withMessage('jobTitle must be a string'),
  body('job_title').optional({ nullable: true, checkFalsy: true }).isString().withMessage('job_title must be a string'),
  body('status').optional().isIn(CLIENT_CONTACT_STATUSES).withMessage(`status must be one of: ${CLIENT_CONTACT_STATUSES.join(', ')}`),
  body('isPrimaryContact').optional().isBoolean().withMessage('isPrimaryContact must be a boolean'),
  body('is_primary_contact').optional().isBoolean().withMessage('is_primary_contact must be a boolean'),
  body('notes').optional({ nullable: true }).isString().withMessage('notes must be a string'),
];

const statusRules = [
  ...contactIdParamRules,
  body('status').isIn(CLIENT_CONTACT_STATUSES).withMessage(`status must be one of: ${CLIENT_CONTACT_STATUSES.join(', ')}`),
];

module.exports = {
  contactIdParamRules,
  listRules,
  createRules,
  updateRules,
  statusRules,
};
