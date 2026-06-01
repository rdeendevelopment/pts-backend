const routes = require('./rbac.routes');
const { ensureRbacIndexes } = require('./models');
const seedService = require('./services/seed.service');
const authorize = require('./middleware/authorize');
const requireSuperAdmin = require('./middleware/requireSuperAdmin');
const rbacAccessService = require('./services/rbacAccess.service');

module.exports = {
  routes,
  ensureRbacIndexes,
  seedRbac: seedService.seedRbac,
  authorize,
  requireSuperAdmin,
  getSessionAccessForAccount: rbacAccessService.getSessionAccessForAccount,
  getPermissionKeysForAccount: rbacAccessService.getPermissionKeysForAccount,
};
