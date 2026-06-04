const { body, param, query } = require('express-validator');
const { BOARD_SHARE_ROLES, BOARD_SHARE_STATUSES } = require('../constants/boardShare.constants');

const idParamRules = [
  param('id').isString().notEmpty().withMessage('Share id is required'),
];

const listRules = [
  query('client_id').optional().isString().withMessage('client_id must be a string'),
  query('clientId').optional().isString().withMessage('clientId must be a string'),
  query('project_id').optional().isString().withMessage('project_id must be a string'),
  query('projectId').optional().isString().withMessage('projectId must be a string'),
  query('status').optional().isIn(BOARD_SHARE_STATUSES).withMessage(`status must be one of: ${BOARD_SHARE_STATUSES.join(', ')}`),
];

const createRules = [
  body().custom((_value, { req }) => {
    if (!req.body?.clientId && !req.body?.client_id) {
      throw new Error('clientId is required');
    }
    if (!req.body?.projectIds?.length && !req.body?.project_ids?.length) {
      throw new Error('projectIds must be a non-empty array');
    }
    return true;
  }),
  body('clientId').optional().isString().withMessage('clientId must be a string'),
  body('client_id').optional().isString().withMessage('client_id must be a string'),
  body('projectIds').optional().isArray({ min: 1 }).withMessage('projectIds must be a non-empty array'),
  body('project_ids').optional().isArray({ min: 1 }).withMessage('project_ids must be a non-empty array'),
  body('role').isIn(BOARD_SHARE_ROLES).withMessage(`role must be one of: ${BOARD_SHARE_ROLES.join(', ')}`),
  body('expiresAt').optional({ nullable: true }).isISO8601().withMessage('expiresAt must be a valid date'),
  body('expires_at').optional({ nullable: true }).isISO8601().withMessage('expires_at must be a valid date'),
];

const updateRules = [
  ...idParamRules,
  body('projectIds').optional().isArray({ min: 1 }).withMessage('projectIds must be a non-empty array'),
  body('project_ids').optional().isArray({ min: 1 }).withMessage('project_ids must be a non-empty array'),
  body('role').optional().isIn(BOARD_SHARE_ROLES).withMessage(`role must be one of: ${BOARD_SHARE_ROLES.join(', ')}`),
  body('status').optional().isIn(BOARD_SHARE_STATUSES).withMessage(`status must be one of: ${BOARD_SHARE_STATUSES.join(', ')}`),
  body('expiresAt').optional({ nullable: true }).isISO8601().withMessage('expiresAt must be a valid date'),
  body('expires_at').optional({ nullable: true }).isISO8601().withMessage('expires_at must be a valid date'),
];

const myProjectsRules = [
  query('scope').optional().isIn(['active', 'archived', 'all']).withMessage('scope must be active, archived, or all'),
];

module.exports = {
  listRules,
  myProjectsRules,
  createRules,
  updateRules,
  idParamRules,
};
