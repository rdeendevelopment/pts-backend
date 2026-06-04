const { AppError } = require('../../../kernel/errors');
const {
  BOARD_SHARE_ROLES,
  ROLE_ALLOWED_ACTIONS,
} = require('../constants/boardShare.constants');
const boardShareErrorCodes = require('../errors/boardShareErrorCodes');
const boardShareRepository = require('../repositories/boardShare.repository');

/** Internal team accounts — board-share rules do not apply. */
const INTERNAL_ACCOUNT_TYPES = new Set(['super_admin', 'admin', 'manager', 'employee']);

function isInternalBoardUser(req) {
  const accountType = String(req?.v2Auth?.account?.accountType || '').toLowerCase();
  return INTERNAL_ACCOUNT_TYPES.has(accountType);
}

/**
 * Client portal users (future accountType `client`) are scoped by board shares.
 * Step 1: helper is ready; task routes will call this in a later step.
 */
function isBoardShareClientUser(req) {
  return String(req?.v2Auth?.account?.accountType || '').toLowerCase() === 'client';
}

function resolveClientIdForAccount(req) {
  const account = req?.v2Auth?.account || {};
  return account.clientId || account.client_id || req?.v2Auth?.clientId || null;
}

function assertShareIsUsable(share) {
  if (!share || share.isDeleted) {
    throw new AppError('Board share not found', {
      status: 404,
      code: boardShareErrorCodes.BOARD_SHARE_NOT_FOUND,
    });
  }
  if (share.status === 'revoked') {
    throw new AppError('Board share has been revoked', {
      status: 403,
      code: boardShareErrorCodes.BOARD_SHARE_REVOKED,
    });
  }
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
    throw new AppError('Board share has expired', {
      status: 403,
      code: boardShareErrorCodes.BOARD_SHARE_EXPIRED,
    });
  }
}

function assertRoleAllowsAction(role, action) {
  const allowed = ROLE_ALLOWED_ACTIONS[role];
  if (!allowed || !allowed.has(action)) {
    throw new AppError('This action is not allowed for your board share role', {
      status: 403,
      code: boardShareErrorCodes.BOARD_SHARE_ACCESS_DENIED,
      details: { role, action },
    });
  }
}

/**
 * Validates client board-share access for a project action.
 * No-op for internal users (existing RBAC + assignment flow unchanged).
 */
async function requireBoardShareAccess(req, projectId, action) {
  if (!req || isInternalBoardUser(req)) {
    return null;
  }

  if (!isBoardShareClientUser(req)) {
    throw new AppError('Board share access required', {
      status: 403,
      code: boardShareErrorCodes.BOARD_SHARE_ACCESS_DENIED,
    });
  }

  const clientId = resolveClientIdForAccount(req);
  if (!clientId) {
    throw new AppError('Client account is not linked to a client organization', {
      status: 403,
      code: boardShareErrorCodes.BOARD_SHARE_ACCESS_DENIED,
    });
  }

  const share = await boardShareRepository.findActiveShareForProject(projectId, clientId);
  assertShareIsUsable(share);

  const projectIdStr = String(projectId);
  const allowedProject = (share.projectIds || []).some((id) => String(id) === projectIdStr);
  if (!allowedProject) {
    throw new AppError('Project is not included in your board share', {
      status: 403,
      code: boardShareErrorCodes.BOARD_SHARE_ACCESS_DENIED,
      details: { projectId: projectIdStr },
    });
  }

  assertRoleAllowsAction(share.role, action);
  return share;
}

function roleAllowsAction(role, action) {
  if (!BOARD_SHARE_ROLES.includes(role)) return false;
  return ROLE_ALLOWED_ACTIONS[role]?.has(action) || false;
}

module.exports = {
  isInternalBoardUser,
  isBoardShareClientUser,
  resolveClientIdForAccount,
  requireBoardShareAccess,
  roleAllowsAction,
  assertShareIsUsable,
};
