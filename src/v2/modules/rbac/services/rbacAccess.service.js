const accountRepository = require('../../auth/repositories/account.repository');
const accountRoleRepository = require('../repositories/accountRole.repository');
const roleRepository = require('../repositories/role.repository');
const permissionRepository = require('../repositories/permission.repository');
const rolePermissionRepository = require('../repositories/rolePermission.repository');
const moduleRepository = require('../../modules/repositories/module.repository');
const { moduleKeyFromPermissionKey } = require('../helpers/permissionKey.helper');
const { toSessionRoleDto } = require('../dto/role.dto');
const { toSessionModuleDto } = require('../../modules/dto/module.dto');

const SESSION_ACCESS_CACHE_TTL_MS = Number(process.env.PTS_V2_SESSION_ACCESS_CACHE_MS || 30000);
const sessionAccessCache = new Map();

/** Maps pts_accounts.accountType to the default pts_roles.key. */
const ACCOUNT_TYPE_DEFAULT_ROLE = {
  super_admin: 'super_admin',
  admin: 'admin',
  manager: 'manager',
  employee: 'employee',
};

/**
 * Accounts without any active role assignment authenticate but fail authorize (403).
 * Repair by assigning the role that matches accountType (idempotent).
 */
async function ensureDefaultRoleAssignment(accountId) {
  const normalizedAccountId = String(accountId);
  const activeRoles = await accountRoleRepository.listByAccountId(normalizedAccountId);
  if (activeRoles.length) return false;

  const account = await accountRepository.findById(normalizedAccountId);
  if (!account || account.isDeleted || account.status !== 'active') return false;

  const roleKey = ACCOUNT_TYPE_DEFAULT_ROLE[account.accountType];
  if (!roleKey) return false;

  const role = await roleRepository.findByKey(roleKey);
  if (!role || role.status !== 'active') return false;

  const existing = await accountRoleRepository.findByAccountAndRole(normalizedAccountId, role._id);
  if (existing && !existing.isDeleted && existing.status === 'active') return false;

  await accountRoleRepository.createAccountRole({
    accountId: normalizedAccountId,
    roleId: role._id,
    assignedBy: null,
    assignedAt: new Date(),
    status: 'active',
  });

  return true;
}

function cacheKey(accountId) {
  return String(accountId);
}

function readCachedSessionAccess(accountId) {
  const entry = sessionAccessCache.get(cacheKey(accountId));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    sessionAccessCache.delete(cacheKey(accountId));
    return null;
  }
  return entry.value;
}

function writeCachedSessionAccess(accountId, value) {
  sessionAccessCache.set(cacheKey(accountId), {
    value,
    expiresAt: Date.now() + SESSION_ACCESS_CACHE_TTL_MS,
  });
  return value;
}

function clearSessionAccessCache(accountId) {
  if (accountId) {
    sessionAccessCache.delete(cacheKey(accountId));
    return;
  }
  sessionAccessCache.clear();
}

async function resolveModulesFromPermissionKeys(permissionKeys) {
  const moduleKeys = [...new Set(
    permissionKeys
      .map(moduleKeyFromPermissionKey)
      .filter(Boolean)
  )];

  if (!moduleKeys.length) return [];

  const rows = await moduleRepository.listByKeys(moduleKeys);
  return rows.map(toSessionModuleDto);
}

async function loadSessionAccessForAccount(accountId) {
  const repaired = await ensureDefaultRoleAssignment(accountId);
  if (repaired) {
    clearSessionAccessCache(accountId);
  }

  const accountRoles = await accountRoleRepository.listByAccountId(accountId);
  if (!accountRoles.length) {
    return { roles: [], permissions: [], modules: [] };
  }

  const roleIds = [...new Set(accountRoles.map((row) => String(row.roleId)))];
  const rolesById = new Map(
    (await roleRepository.findByIds(roleIds)).map((role) => [String(role._id), role])
  );

  const roles = [];
  const activeRoleIds = [];

  for (const accountRole of accountRoles) {
    const role = rolesById.get(String(accountRole.roleId));
    if (!role) continue;
    roles.push(toSessionRoleDto(role));
    activeRoleIds.push(role._id);
  }

  const rolePermissions = await rolePermissionRepository.findByRoleIds(activeRoleIds);
  const permissionIds = [...new Set(rolePermissions.map((row) => String(row.permissionId)))];
  const permissionsById = new Map(
    (await permissionRepository.findByIds(permissionIds)).map((permission) => [
      String(permission._id),
      permission,
    ])
  );

  const permissionKeys = new Set();
  for (const rolePermission of rolePermissions) {
    const permission = permissionsById.get(String(rolePermission.permissionId));
    if (permission?.key) permissionKeys.add(permission.key);
  }

  const modules = await resolveModulesFromPermissionKeys([...permissionKeys]);

  return {
    roles,
    permissions: [...permissionKeys].sort(),
    modules,
  };
}

async function getSessionAccessForAccount(accountId) {
  const cached = readCachedSessionAccess(accountId);
  if (cached) return cached;

  const access = await loadSessionAccessForAccount(accountId);
  return writeCachedSessionAccess(accountId, access);
}

async function getPermissionKeysForAccount(accountId) {
  const access = await getSessionAccessForAccount(accountId);
  return access.permissions;
}

async function getSessionRolesForAccounts(accountIds = []) {
  const normalizedIds = [...new Set(accountIds.map((id) => String(id)).filter(Boolean))];
  if (!normalizedIds.length) return new Map();

  const accountRoles = await accountRoleRepository.listByAccountIds(normalizedIds);
  if (!accountRoles.length) return new Map();

  const roleIds = [...new Set(accountRoles.map((row) => String(row.roleId)))];
  const rolesById = new Map(
    (await roleRepository.findByIds(roleIds)).map((role) => [String(role._id), role])
  );

  const rolesByAccountId = new Map();
  for (const accountId of normalizedIds) {
    rolesByAccountId.set(accountId, []);
  }

  for (const row of accountRoles) {
    const role = rolesById.get(String(row.roleId));
    if (!role) continue;
    const bucket = rolesByAccountId.get(String(row.accountId)) || [];
    bucket.push(toSessionRoleDto(role));
    rolesByAccountId.set(String(row.accountId), bucket);
  }

  return rolesByAccountId;
}

module.exports = {
  getPermissionKeysForAccount,
  getSessionAccessForAccount,
  getSessionRolesForAccounts,
  clearSessionAccessCache,
  ensureDefaultRoleAssignment,
};
