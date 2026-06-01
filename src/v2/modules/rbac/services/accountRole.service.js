const { AppError } = require('../../../kernel/errors');
const rbacErrorCodes = require('../errors/rbacErrorCodes');
const accountRepository = require('../../auth/repositories/account.repository');
const roleRepository = require('../repositories/role.repository');
const accountRoleRepository = require('../repositories/accountRole.repository');
const rbacAccessService = require('./rbacAccess.service');
const { toAccountRoleDto } = require('../dto/accountRole.dto');

async function assertAccountExists(accountId) {
  const account = await accountRepository.findById(accountId);
  if (!account) {
    throw new AppError('Account not found', {
      status: 404,
      code: rbacErrorCodes.RBAC_ROLE_NOT_FOUND,
      details: { accountId: String(accountId) },
    });
  }
  return account;
}

async function getRoleOrThrow(roleId) {
  const role = await roleRepository.findById(roleId);
  if (!role) {
    throw new AppError('Role not found', {
      status: 404,
      code: rbacErrorCodes.RBAC_ROLE_NOT_FOUND,
    });
  }
  return role;
}

async function listAccountRoles(accountId) {
  await assertAccountExists(accountId);

  const rows = await accountRoleRepository.listByAccountId(accountId, { includeInactive: true });
  if (!rows.length) return [];

  const roleIds = [...new Set(rows.map((row) => String(row.roleId)))];
  const rolesById = new Map(
    (await roleRepository.findByIds(roleIds)).map((role) => [String(role._id), role])
  );

  return rows.map((row) => toAccountRoleDto(row, rolesById.get(String(row.roleId)) || null));
}

async function assignAccountRole(accountId, payload, assignedByAccountId) {
  await assertAccountExists(accountId);

  const role = await getRoleOrThrow(payload.roleId || payload.role_id);
  if (role.status !== 'active') {
    throw new AppError('Inactive roles cannot be assigned', {
      status: 409,
      code: rbacErrorCodes.RBAC_ROLE_NOT_FOUND,
      details: { key: role.key, status: role.status },
    });
  }

  const existing = await accountRoleRepository.findByAccountAndRole(accountId, role._id);
  if (existing) {
    throw new AppError('Account already has this role', {
      status: 409,
      code: rbacErrorCodes.RBAC_ACCOUNT_ROLE_ALREADY_EXISTS,
      details: { roleKey: role.key },
    });
  }

  const accountRole = await accountRoleRepository.createAccountRole({
    accountId,
    roleId: role._id,
    assignedBy: assignedByAccountId || null,
    assignedAt: new Date(),
    status: 'active',
  });

  rbacAccessService.clearSessionAccessCache(accountId);

  return toAccountRoleDto(accountRole, role);
}

async function removeAccountRole(accountId, roleId) {
  await assertAccountExists(accountId);
  await getRoleOrThrow(roleId);

  const existing = await accountRoleRepository.findByAccountAndRole(accountId, roleId);
  if (!existing) {
    throw new AppError('Account role assignment not found', {
      status: 404,
      code: rbacErrorCodes.RBAC_ACCOUNT_ROLE_NOT_FOUND,
    });
  }

  await accountRoleRepository.softDeleteByAccountAndRole(accountId, roleId);
  rbacAccessService.clearSessionAccessCache(accountId);

  return { deleted: true, account_id: String(accountId), role_id: String(roleId) };
}

module.exports = {
  listAccountRoles,
  assignAccountRole,
  removeAccountRole,
};
