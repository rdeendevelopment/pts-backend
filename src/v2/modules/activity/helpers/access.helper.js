const { AppError } = require('../../../kernel/errors');
const activityErrorCodes = require('../errors/activityErrorCodes');

function accountHasManagePermission(req) {
  const permissions = req.v2Activity?.permissions || [];
  return permissions.includes('activity.manage');
}

function accountHasProjectViewPermission(req) {
  const permissions = req.v2Activity?.permissions || [];
  return permissions.includes('projects.view') || permissions.includes('projects.manage');
}

/** List all users' time entries for a project (admin project detail, reports). */
function canViewAllProjectTimeEntries(req) {
  return accountHasManagePermission(req) || accountHasProjectViewPermission(req);
}

function assertOwnUserOrManage(req, targetUserId) {
  const canManage = accountHasManagePermission(req);
  if (canManage) return;

  const ownUserId = req.v2Activity?.userId;
  if (!ownUserId || String(ownUserId) !== String(targetUserId)) {
    throw new AppError('Forbidden activity access', {
      status: 403,
      code: activityErrorCodes.ACTIVITY_FORBIDDEN,
    });
  }
}

function assertActivityEmployeeProfile(req) {
  if (req.v2Activity?.userId) return;
  throw new AppError('User profile not found for account', {
    status: 404,
    code: activityErrorCodes.ACTIVITY_USER_NOT_FOUND,
  });
}

function resolveActivityUserId(req, fallbackUserId = null) {
  return req.v2Activity?.userId || fallbackUserId;
}

module.exports = {
  accountHasManagePermission,
  accountHasProjectViewPermission,
  canViewAllProjectTimeEntries,
  assertOwnUserOrManage,
  assertActivityEmployeeProfile,
  resolveActivityUserId,
};
