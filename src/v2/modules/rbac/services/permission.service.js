const permissionRepository = require('../repositories/permission.repository');
const { toPermissionDto } = require('../dto/permission.dto');

async function listPermissions() {
  const rows = await permissionRepository.listPermissions();
  return rows.map(toPermissionDto);
}

module.exports = {
  listPermissions,
};
