const { getAccountRoleModel } = require('../models/accountRole.model');

async function listByAccountId(accountId, { includeInactive = false } = {}) {
  const AccountRole = getAccountRoleModel();
  const query = { accountId, isDeleted: false };
  if (!includeInactive) query.status = 'active';
  return AccountRole.find(query).sort({ assignedAt: -1 }).lean();
}

async function listByAccountIds(accountIds = [], { includeInactive = false } = {}) {
  if (!accountIds.length) return [];
  const AccountRole = getAccountRoleModel();
  const query = { accountId: { $in: accountIds }, isDeleted: false };
  if (!includeInactive) query.status = 'active';
  return AccountRole.find(query).sort({ assignedAt: -1 }).lean();
}

async function findByAccountAndRole(accountId, roleId) {
  const AccountRole = getAccountRoleModel();
  return AccountRole.findOne({ accountId, roleId, isDeleted: false }).exec();
}

async function createAccountRole(payload) {
  const AccountRole = getAccountRoleModel();
  return AccountRole.create(payload);
}

async function softDeleteAccountRole(accountRoleId) {
  const AccountRole = getAccountRoleModel();
  return AccountRole.findOneAndUpdate(
    { _id: accountRoleId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), status: 'inactive' } },
    { returnDocument: 'after' }
  ).exec();
}

async function softDeleteByAccountAndRole(accountId, roleId) {
  const AccountRole = getAccountRoleModel();
  return AccountRole.findOneAndUpdate(
    { accountId, roleId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), status: 'inactive' } },
    { returnDocument: 'after' }
  ).exec();
}

module.exports = {
  listByAccountId,
  listByAccountIds,
  findByAccountAndRole,
  createAccountRole,
  softDeleteAccountRole,
  softDeleteByAccountAndRole,
};
