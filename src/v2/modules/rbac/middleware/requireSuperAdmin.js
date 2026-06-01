const { AppError } = require('../../../kernel/errors');
const rbacErrorCodes = require('../errors/rbacErrorCodes');

/** Temporary guard for routes that only super_admin accountType should reach during bootstrap. */
function requireSuperAdmin(req, _res, next) {
  try {
    const accountType = req.v2Auth?.account?.accountType;
    if (accountType !== 'super_admin') {
      throw new AppError('Super admin access required', {
        status: 403,
        code: rbacErrorCodes.RBAC_FORBIDDEN,
        details: { accountType: accountType || null },
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = requireSuperAdmin;
