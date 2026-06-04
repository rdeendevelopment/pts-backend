const BOARD_SHARE_ROLES = ['viewer', 'commenter', 'contributor'];
const BOARD_SHARE_STATUSES = ['active', 'revoked'];

/** Actions validated for client board-share users (internal users bypass). */
const BOARD_SHARE_ACTIONS = {
  VIEW_BOARD: 'view_board',
  VIEW_TASK: 'view_task',
  COMMENT: 'comment',
  UPLOAD_ATTACHMENT: 'upload_attachment',
  CREATE_TASK: 'create_task',
  EDIT_TASK: 'edit_task',
  MOVE_TASK: 'move_task',
  CHANGE_STATUS: 'change_status',
  ASSIGN: 'assign',
  DELETE_TASK: 'delete_task',
  MANAGE_SETTINGS: 'manage_settings',
  MANAGE_MEMBERS: 'manage_members',
};

const ROLE_ALLOWED_ACTIONS = {
  viewer: new Set([
    BOARD_SHARE_ACTIONS.VIEW_BOARD,
    BOARD_SHARE_ACTIONS.VIEW_TASK,
  ]),
  commenter: new Set([
    BOARD_SHARE_ACTIONS.VIEW_BOARD,
    BOARD_SHARE_ACTIONS.VIEW_TASK,
    BOARD_SHARE_ACTIONS.COMMENT,
    BOARD_SHARE_ACTIONS.UPLOAD_ATTACHMENT,
  ]),
  contributor: new Set([
    BOARD_SHARE_ACTIONS.VIEW_BOARD,
    BOARD_SHARE_ACTIONS.VIEW_TASK,
    BOARD_SHARE_ACTIONS.COMMENT,
    BOARD_SHARE_ACTIONS.UPLOAD_ATTACHMENT,
    BOARD_SHARE_ACTIONS.CREATE_TASK,
    BOARD_SHARE_ACTIONS.EDIT_TASK,
    BOARD_SHARE_ACTIONS.MOVE_TASK,
    BOARD_SHARE_ACTIONS.CHANGE_STATUS,
  ]),
};

module.exports = {
  BOARD_SHARE_ROLES,
  BOARD_SHARE_STATUSES,
  BOARD_SHARE_ACTIONS,
  ROLE_ALLOWED_ACTIONS,
};
