const { AppError } = require('../../../kernel/errors');
const activityErrorCodes = require('../errors/activityErrorCodes');
const timeValidationService = require('../services/timeValidation.service');
const rbacAccessService = require('../../rbac/services/rbacAccess.service');

function canObserveProjectActivity(permissions = []) {
  return permissions.includes('activity.manage')
    || permissions.includes('projects.view')
    || permissions.includes('projects.manage');
}

async function attachActivityUser(req, _res, next) {
  try {
    const permissions = await rbacAccessService.getPermissionKeysForAccount(req.v2Auth.accountId);
    const user = await timeValidationService.resolveUserByAccountIdOptional(req.v2Auth.accountId);

    if (!user && !canObserveProjectActivity(permissions)) {
      throw new AppError('User profile not found for account', {
        status: 404,
        code: activityErrorCodes.ACTIVITY_USER_NOT_FOUND,
      });
    }

    req.v2Activity = {
      userId: user ? String(user._id) : null,
      user: user || null,
      permissions,
      hasEmployeeProfile: Boolean(user),
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = attachActivityUser;
