const { ensurePermissionIndexes } = require('./permission.model');
const { ensureRoleIndexes } = require('./role.model');
const { ensureRolePermissionIndexes } = require('./rolePermission.model');
const { ensureAccountRoleIndexes } = require('./accountRole.model');

async function ensureRbacIndexes() {
  await Promise.all([
    ensurePermissionIndexes(),
    ensureRoleIndexes(),
    ensureRolePermissionIndexes(),
    ensureAccountRoleIndexes(),
  ]);
}

module.exports = {
  ensureRbacIndexes,
};
