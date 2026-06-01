const { AppError } = require('../../../kernel/errors');
const rbacErrorCodes = require('../errors/rbacErrorCodes');
const { hasRequiredPermissions } = require('../helpers/authorize.helper');
const rbacAccessService = require('../services/rbacAccess.service');

/**
 * Require one or more permission keys on the authenticated account.
 * mode 'any' = at least one match; mode 'all' = every key required.
 */
function authorize(requiredPermissions, { mode = 'all' } = {}) {
  const keys = (Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions])
    .filter(Boolean);

  return async (req, _res, next) => {
    try {
      if (!req.v2Auth?.accountId) {
        throw new AppError('Unauthorized', {
          status: 401,
          code: rbacErrorCodes.RBAC_FORBIDDEN,
        });
      }

      const accountPermissions = req.v2Auth.permissions
        || await rbacAccessService.getPermissionKeysForAccount(req.v2Auth.accountId);
      const allowed = hasRequiredPermissions(accountPermissions, keys, mode);

      if (!allowed) {
        throw new AppError('You do not have permission to perform this action', {
          status: 403,
          code: rbacErrorCodes.RBAC_FORBIDDEN,
          details: { required: keys, mode },
        });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = authorize;
