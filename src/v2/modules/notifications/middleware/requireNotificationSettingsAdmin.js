const { AppError } = require('../../../kernel/errors');
const rbacErrorCodes = require('../../rbac/errors/rbacErrorCodes');

/**
 * PTS's current admin UI treats legacy `admin` and V2 `super_admin` accounts as
 * platform administrators. Keep this operational settings route aligned with
 * that established boundary while continuing to reject every non-admin role.
 */
function requireNotificationSettingsAdmin(req, _res, next) {
  try {
    const accountType = req.v2Auth?.account?.accountType;
    const roleKeys = (req.v2Auth?.sessionAccess?.roles || [])
      .map((role) => (typeof role === 'string' ? role : role?.key))
      .filter(Boolean);
    const isPlatformAdmin = ['admin', 'super_admin'].includes(accountType)
      || roleKeys.some((role) => ['admin', 'super_admin'].includes(role));
    if (!isPlatformAdmin) {
      throw new AppError('Platform administrator access required', {
        status: 403,
        code: rbacErrorCodes.RBAC_FORBIDDEN,
        details: { accountType: accountType || null, roles: roleKeys },
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = requireNotificationSettingsAdmin;
