const { getPermissionModel } = require('../models/permission.model');

async function listPermissions({ includeDeleted = false } = {}) {
  const Permission = getPermissionModel();
  const query = {};
  if (!includeDeleted) query.isDeleted = false;
  return Permission.find(query).sort({ key: 1 }).lean();
}

async function listActivePermissions() {
  const Permission = getPermissionModel();
  return Permission.find({ isDeleted: false, status: 'active' }).sort({ key: 1 }).lean();
}

async function findById(permissionId) {
  const Permission = getPermissionModel();
  return Permission.findOne({ _id: permissionId, isDeleted: false }).exec();
}

async function findByIds(permissionIds = []) {
  if (!permissionIds.length) return [];
  const Permission = getPermissionModel();
  return Permission.find({
    _id: { $in: permissionIds },
    isDeleted: false,
    status: 'active',
  }).lean();
}

async function findByKey(key, { includeDeleted = false } = {}) {
  const Permission = getPermissionModel();
  const query = { key: String(key).toLowerCase().trim() };
  if (!includeDeleted) query.isDeleted = false;
  return Permission.findOne(query).exec();
}

async function createPermission(payload) {
  const Permission = getPermissionModel();
  return Permission.create(payload);
}

async function updatePermission(permissionId, payload) {
  const Permission = getPermissionModel();
  return Permission.findOneAndUpdate(
    { _id: permissionId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

module.exports = {
  listPermissions,
  listActivePermissions,
  findById,
  findByIds,
  findByKey,
  createPermission,
  updatePermission,
};
