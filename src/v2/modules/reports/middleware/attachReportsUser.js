const userRepository = require('../../users/repositories/user.repository');
const rbacAccessService = require('../../rbac/services/rbacAccess.service');
const { AppError } = require('../../../kernel/errors');
const reportErrorCodes = require('../errors/reportErrorCodes');

async function attachReportsUser(req, _res, next) {
  try {
    const user = await userRepository.findByAccountId(req.v2Auth.accountId);
    if (!user) {
      throw new AppError('User profile not found for account', {
        status: 404,
        code: reportErrorCodes.REPORT_USER_NOT_FOUND,
      });
    }

    const permissions = await rbacAccessService.getPermissionKeysForAccount(req.v2Auth.accountId);
    req.v2Reports = {
      userId: String(user._id),
      user,
      permissions,
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = attachReportsUser;
