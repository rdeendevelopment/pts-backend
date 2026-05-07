const jwt = require('jsonwebtoken');

const constants = require('../../../config/constants');
const { findAccountFromTokenPayload, loadAccess } = require('../Services/auth/access-control.service');

function readBearer(req) {
  return String(req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

async function authenticate(req, res, next) {
  const token = readBearer(req);
  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, constants.APP_SECRET);
    const result = await findAccountFromTokenPayload(decoded);
    if (!result) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const access = await loadAccess(result.accountType, result.account);
    req.auth = {
      accountType: result.accountType,
      user: result.account,
      roles: access.roles,
      modules: access.modules,
      permissions: access.permissions,
      tokenPayload: decoded,
    };
    req.user = result.account;

    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
}

function requirePermission(permissionKey) {
  return function permissionMiddleware(req, res, next) {
    if (!req.auth?.permissions?.includes(permissionKey)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    return next();
  };
}

function requireAnyPermission(permissionKeys = []) {
  return function anyPermissionMiddleware(req, res, next) {
    const granted = permissionKeys.some((permissionKey) => req.auth?.permissions?.includes(permissionKey));
    if (!granted) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    return next();
  };
}

function requireModule(moduleKey) {
  return function moduleMiddleware(req, res, next) {
    if (!req.auth?.modules?.includes(moduleKey)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    return next();
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.auth?.roles?.includes('SUPER_ADMIN')) {
    return res.status(403).json({ success: false, message: 'Only super admin can perform this action' });
  }
  return next();
}

module.exports = {
  authenticate,
  requireAnyPermission,
  requireModule,
  requirePermission,
  requireSuperAdmin,
};
