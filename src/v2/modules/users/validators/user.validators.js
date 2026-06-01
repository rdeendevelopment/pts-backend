const { body, param, query } = require('express-validator');
const {
  USER_STATUSES,
  EMPLOYMENT_TYPES,
  MAX_LIST_LIMIT,
} = require('../constants/users.constants');

function optionalStringField(field, message = `${field} must be a string`) {
  return body(field)
    .optional({ nullable: true, checkFalsy: true })
    .customSanitizer((value) => (value == null || value === '' ? null : String(value)))
    .isString()
    .withMessage(message);
}

const listRules = [
  query('search').optional().isString().withMessage('search must be a string'),
  query('status').optional().isIn(USER_STATUSES).withMessage(`status must be one of: ${USER_STATUSES.join(', ')}`),
  query('department').optional().isString().withMessage('department must be a string'),
  query('employmentType').optional().isIn(EMPLOYMENT_TYPES).withMessage(`employmentType must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),
  query('employment_type').optional().isIn(EMPLOYMENT_TYPES).withMessage(`employment_type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),
  query('managerId').optional().isString().withMessage('managerId must be a string'),
  query('manager_id').optional().isString().withMessage('manager_id must be a string'),
  query('cursor').optional().isString().withMessage('cursor must be a string'),
  query('limit').optional().isInt({ min: 1, max: MAX_LIST_LIMIT }).withMessage(`limit must be between 1 and ${MAX_LIST_LIMIT}`),
  query('includeRoles').optional().isIn(['true', 'false']).withMessage('includeRoles must be true or false'),
  query('include_roles').optional().isIn(['true', 'false']).withMessage('include_roles must be true or false'),
];

const idParamRules = [
  param('id').isString().notEmpty().withMessage('User id is required'),
];

const createRules = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('first_name').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('last_name').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Valid email is required when provided'),
  body('password').optional().isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('accountId').optional().isString().withMessage('accountId must be a string'),
  body('account_id').optional().isString().withMessage('account_id must be a string'),
  body('username').optional({ nullable: true, checkFalsy: true }).isString().withMessage('username must be a string'),
  body('user_name').optional({ nullable: true, checkFalsy: true }).isString().withMessage('user_name must be a string'),
  body('userName').optional({ nullable: true, checkFalsy: true }).isString().withMessage('userName must be a string'),
  body('displayName').optional().isString().withMessage('displayName must be a string'),
  body('display_name').optional().isString().withMessage('display_name must be a string'),
  optionalStringField('phone'),
  optionalStringField('contact'),
  body('avatarUrl').optional().isString().withMessage('avatarUrl must be a string'),
  body('avatar_url').optional().isString().withMessage('avatar_url must be a string'),
  body('jobTitle').optional().isString().withMessage('jobTitle must be a string'),
  body('job_title').optional().isString().withMessage('job_title must be a string'),
  body('department').optional().isString().withMessage('department must be a string'),
  body('employmentType').optional().isIn(EMPLOYMENT_TYPES).withMessage(`employmentType must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),
  body('employment_type').optional().isIn(EMPLOYMENT_TYPES).withMessage(`employment_type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),
  body('status').optional().isIn(USER_STATUSES).withMessage(`status must be one of: ${USER_STATUSES.join(', ')}`),
  body('managerId').optional().isString().withMessage('managerId must be a string'),
  body('manager_id').optional().isString().withMessage('manager_id must be a string'),
  body('joiningDate').optional().isISO8601().withMessage('joiningDate must be a valid date'),
  body('joining_date').optional().isISO8601().withMessage('joining_date must be a valid date'),
  body('timezone').optional().isString().withMessage('timezone must be a string'),
  body('notes').optional().isString().withMessage('notes must be a string'),
  body().custom((value) => {
    const firstName = value.firstName || value.first_name;
    const lastName = value.lastName || value.last_name;
    if (!firstName || !lastName) {
      throw new Error('firstName and lastName are required');
    }
    const hasAccount = Boolean(value.accountId || value.account_id);
    const username = value.username || value.user_name || value.userName;
    if (!hasAccount && !username) {
      throw new Error('username is required when accountId is not provided');
    }
    if (!hasAccount && !value.password) {
      throw new Error('password is required when accountId is not provided');
    }
    return true;
  }),
];

const profileUpdateRules = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('first_name').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('last_name').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Valid email is required when provided'),
  body('username').optional({ nullable: true, checkFalsy: true }).isString().withMessage('username must be a string'),
  body('user_name').optional({ nullable: true, checkFalsy: true }).isString().withMessage('user_name must be a string'),
  body('userName').optional({ nullable: true, checkFalsy: true }).isString().withMessage('userName must be a string'),
  body('displayName').optional().isString().withMessage('displayName must be a string'),
  body('display_name').optional().isString().withMessage('display_name must be a string'),
  optionalStringField('phone'),
  optionalStringField('contact'),
  body('avatarUrl').optional().isString().withMessage('avatarUrl must be a string'),
  body('avatar_url').optional().isString().withMessage('avatar_url must be a string'),
  body('image_url').optional().isString().withMessage('image_url must be a string'),
  body('jobTitle').optional().isString().withMessage('jobTitle must be a string'),
  body('job_title').optional().isString().withMessage('job_title must be a string'),
  body('department').optional().isString().withMessage('department must be a string'),
  body('employmentType').optional().isIn(EMPLOYMENT_TYPES).withMessage(`employmentType must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),
  body('employment_type').optional().isIn(EMPLOYMENT_TYPES).withMessage(`employment_type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),
  body('managerId').optional().isString().withMessage('managerId must be a string'),
  body('manager_id').optional().isString().withMessage('manager_id must be a string'),
  body('joiningDate').optional().isISO8601().withMessage('joiningDate must be a valid date'),
  body('joining_date').optional().isISO8601().withMessage('joining_date must be a valid date'),
  body('timezone').optional().isString().withMessage('timezone must be a string'),
  body('notes').optional().isString().withMessage('notes must be a string'),
];

const updateRules = [
  ...idParamRules,
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('first_name').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('last_name').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Valid email is required when provided'),
  body('username').optional({ nullable: true, checkFalsy: true }).isString().withMessage('username must be a string'),
  body('user_name').optional({ nullable: true, checkFalsy: true }).isString().withMessage('user_name must be a string'),
  body('userName').optional({ nullable: true, checkFalsy: true }).isString().withMessage('userName must be a string'),
  body('displayName').optional().isString().withMessage('displayName must be a string'),
  body('display_name').optional().isString().withMessage('display_name must be a string'),
  optionalStringField('phone'),
  optionalStringField('contact'),
  body('avatarUrl').optional().isString().withMessage('avatarUrl must be a string'),
  body('avatar_url').optional().isString().withMessage('avatar_url must be a string'),
  body('jobTitle').optional().isString().withMessage('jobTitle must be a string'),
  body('job_title').optional().isString().withMessage('job_title must be a string'),
  body('department').optional().isString().withMessage('department must be a string'),
  body('employmentType').optional().isIn(EMPLOYMENT_TYPES).withMessage(`employmentType must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),
  body('employment_type').optional().isIn(EMPLOYMENT_TYPES).withMessage(`employment_type must be one of: ${EMPLOYMENT_TYPES.join(', ')}`),
  body('managerId').optional().isString().withMessage('managerId must be a string'),
  body('manager_id').optional().isString().withMessage('manager_id must be a string'),
  body('joiningDate').optional().isISO8601().withMessage('joiningDate must be a valid date'),
  body('joining_date').optional().isISO8601().withMessage('joining_date must be a valid date'),
  body('timezone').optional().isString().withMessage('timezone must be a string'),
  body('notes').optional().isString().withMessage('notes must be a string'),
];

const statusRules = [
  ...idParamRules,
  body('status').isIn(USER_STATUSES).withMessage(`status must be one of: ${USER_STATUSES.join(', ')}`),
];

const passwordRules = [
  ...idParamRules,
  body('password').optional().isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('newPassword').optional().isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('new_password').optional().isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body().custom((value) => {
    if (!value.password && !value.newPassword && !value.new_password) {
      throw new Error('password is required');
    }
    return true;
  }),
];

const changePasswordRules = [
  body('currentPassword').optional().isString().notEmpty().withMessage('Current password is required'),
  body('oldPassword').optional().isString().notEmpty().withMessage('Current password is required'),
  body('old_password').optional().isString().notEmpty().withMessage('Current password is required'),
  body('newPassword').optional().isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('new_password').optional().isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('password').optional().isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body().custom((value) => {
    const current = value.currentPassword || value.oldPassword || value.old_password;
    const next = value.newPassword || value.new_password || value.password;
    if (!current) throw new Error('Current password is required');
    if (!next) throw new Error('New password is required');
    return true;
  }),
];

const deleteQueryRules = [
  query('force').optional().isIn(['true', 'false']).withMessage('force must be true or false'),
];

module.exports = {
  listRules,
  idParamRules,
  createRules,
  profileUpdateRules,
  updateRules,
  statusRules,
  passwordRules,
  changePasswordRules,
  deleteQueryRules,
};
