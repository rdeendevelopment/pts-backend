const { getRoleModel } = require('../models/role.model');

async function listRoles({ includeDeleted = false } = {}) {
  const Role = getRoleModel();
  const query = {};
  if (!includeDeleted) query.isDeleted = false;
  return Role.find(query).sort({ priority: 1, key: 1 }).lean();
}

async function listActiveRoles() {
  const Role = getRoleModel();
  return Role.find({ isDeleted: false, status: 'active' }).sort({ priority: 1, key: 1 }).lean();
}

async function findById(roleId) {
  const Role = getRoleModel();
  return Role.findOne({ _id: roleId, isDeleted: false }).exec();
}

async function findByIds(roleIds = []) {
  if (!roleIds.length) return [];
  const Role = getRoleModel();
  return Role.find({
    _id: { $in: roleIds },
    isDeleted: false,
    status: 'active',
  }).lean();
}

async function findByKey(key, { includeDeleted = false } = {}) {
  const Role = getRoleModel();
  const query = { key: String(key).toLowerCase().trim() };
  if (!includeDeleted) query.isDeleted = false;
  return Role.findOne(query).exec();
}

async function createRole(payload) {
  const Role = getRoleModel();
  return Role.create(payload);
}

async function updateRole(roleId, payload) {
  const Role = getRoleModel();
  return Role.findOneAndUpdate(
    { _id: roleId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function softDeleteRole(roleId) {
  const Role = getRoleModel();
  return Role.findOneAndUpdate(
    { _id: roleId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { returnDocument: 'after' }
  ).exec();
}

module.exports = {
  listRoles,
  listActiveRoles,
  findById,
  findByIds,
  findByKey,
  createRole,
  updateRole,
  softDeleteRole,
};
