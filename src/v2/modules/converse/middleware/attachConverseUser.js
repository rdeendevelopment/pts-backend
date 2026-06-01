const { ensureUserProfileForAccount } = require('../../users/services/user.service');
const rbacAccessService = require('../../rbac/services/rbacAccess.service');

async function attachConverseUser(req, _res, next) {
  try {
    const permissions = await rbacAccessService.getPermissionKeysForAccount(req.v2Auth.accountId);
    const user = await ensureUserProfileForAccount(req.v2Auth.accountId);

    req.v2Converse = {
      userId: String(user._id),
      user,
      permissions,
      displayName: user.displayName
        || [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
        || user.email,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = attachConverseUser;
