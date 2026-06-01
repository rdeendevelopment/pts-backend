const { getRolePermissionModel } = require('../models/rolePermission.model');

async function findByRoleId(roleId) {
  const RolePermission = getRolePermissionModel();
  return RolePermission.find({ roleId, isDeleted: false }).lean();
}

async function findByRoleIds(roleIds = []) {
  if (!roleIds.length) return [];
  const RolePermission = getRolePermissionModel();
  return RolePermission.find({ roleId: { $in: roleIds }, isDeleted: false }).lean();
}

async function findByRoleAndPermission(roleId, permissionId) {
  const RolePermission = getRolePermissionModel();
  return RolePermission.findOne({ roleId, permissionId, isDeleted: false }).exec();
}

async function createRolePermission(payload) {
  const RolePermission = getRolePermissionModel();
  return RolePermission.create(payload);
}

async function softDeleteByRoleId(roleId) {
  const RolePermission = getRolePermissionModel();
  return RolePermission.updateMany(
    { roleId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } }
  );
}

module.exports = {
  findByRoleId,
  findByRoleIds,
  findByRoleAndPermission,
  createRolePermission,
  softDeleteByRoleId,
};
