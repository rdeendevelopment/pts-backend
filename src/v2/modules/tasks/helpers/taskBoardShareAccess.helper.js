const { AppError } = require('../../../kernel/errors');
const {
  isBoardShareClientUser,
  isInternalBoardUser,
  requireBoardShareAccess,
  roleAllowsAction,
} = require('../../board-shares/helpers/boardShareAccess.helper');
const { BOARD_SHARE_ACTIONS } = require('../../board-shares/constants/boardShare.constants');
const boardShareErrorCodes = require('../../board-shares/errors/boardShareErrorCodes');

function mapShareRoleToBoardCapabilities(shareRole) {
  const role = shareRole || 'viewer';
  return {
    canEditTasks: roleAllowsAction(role, BOARD_SHARE_ACTIONS.CREATE_TASK),
    canComment: roleAllowsAction(role, BOARD_SHARE_ACTIONS.COMMENT),
    canCreateTask: roleAllowsAction(role, BOARD_SHARE_ACTIONS.CREATE_TASK),
    canMoveTask: roleAllowsAction(role, BOARD_SHARE_ACTIONS.MOVE_TASK),
    shareRole: role,
    isClientPortal: true,
  };
}

function mapShareRoleToTaskCapabilities(shareRole) {
  const role = shareRole || 'viewer';
  return {
    canEdit: roleAllowsAction(role, BOARD_SHARE_ACTIONS.EDIT_TASK),
    canComment: roleAllowsAction(role, BOARD_SHARE_ACTIONS.COMMENT),
    canMove: roleAllowsAction(role, BOARD_SHARE_ACTIONS.MOVE_TASK),
    canArchive: false,
    shareRole: role,
  };
}

async function assertClientBoardShare(req, projectId, action) {
  const share = await requireBoardShareAccess(req, projectId, action);
  req.boardShare = share;
  return share;
}

function rejectClientUsers(message = 'This feature is not available for client portal accounts') {
  return (req, _res, next) => {
    if (isBoardShareClientUser(req)) {
      return next(new AppError(message, {
        status: 403,
        code: boardShareErrorCodes.BOARD_SHARE_ACCESS_DENIED,
      }));
    }
    return next();
  };
}

function isClientPortalRequest(req) {
  return isBoardShareClientUser(req);
}

module.exports = {
  BOARD_SHARE_ACTIONS,
  mapShareRoleToBoardCapabilities,
  mapShareRoleToTaskCapabilities,
  assertClientBoardShare,
  rejectClientUsers,
  isClientPortalRequest,
  isInternalBoardUser,
  isBoardShareClientUser,
  roleAllowsAction,
};
