const { AppError } = require('../../../kernel/errors');
const activityErrorCodes = require('../errors/activityErrorCodes');

function accountHasManagePermission(req) {
  const permissions = req.v2Activity?.permissions || req.v2Auth?.permissions || [];
  return permissions.includes('activity.manage');
}

function accountHasViewAllPermission(req) {
  const permissions = req.v2Activity?.permissions || req.v2Auth?.permissions || [];
  return permissions.includes('activity.view_all');
}

/** List all users' time entries for a project (admin project detail, reports). */
function canViewAllProjectTimeEntries(req) {
  return accountHasManagePermission(req) || accountHasViewAllPermission(req);
}

function requestedActivityUserId(query = {}) {
  return query.userId
    || query.user_id
    || query.employeeId
    || query.employee_id
    || query.memberId
    || query.member_id
    || null;
}

function buildActivityUserScope(req, query = {}, baseFilters = {}) {
  const filters = { ...baseFilters };

  if (canViewAllProjectTimeEntries(req)) {
    const requestedUserId = requestedActivityUserId(query);
    if (requestedUserId) filters.userId = requestedUserId;
    return filters;
  }

  assertActivityEmployeeProfile(req);
  filters.userId = req.v2Activity.userId;
  return filters;
}

function assertOwnUserOrViewAll(req, targetUserId) {
  if (canViewAllProjectTimeEntries(req)) return;

  const ownUserId = req.v2Activity?.userId;
  if (!ownUserId || String(ownUserId) !== String(targetUserId)) {
    throw new AppError('Forbidden activity access', {
      status: 403,
      code: activityErrorCodes.ACTIVITY_FORBIDDEN,
    });
  }
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
  accountHasViewAllPermission,
  canViewAllProjectTimeEntries,
  requestedActivityUserId,
  buildActivityUserScope,
  assertOwnUserOrViewAll,
  assertOwnUserOrManage,
  assertActivityEmployeeProfile,
  resolveActivityUserId,
};
