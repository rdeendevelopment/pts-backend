const { info } = require('../../../kernel/logger');
const accountRepository = require('../../auth/repositories/account.repository');
const moduleRepository = require('../../modules/repositories/module.repository');
const permissionRepository = require('../repositories/permission.repository');
const roleRepository = require('../repositories/role.repository');
const rolePermissionRepository = require('../repositories/rolePermission.repository');
const accountRoleRepository = require('../repositories/accountRole.repository');
const DEFAULT_PERMISSIONS = require('../helpers/defaultPermissions.helper');
const {
  DEFAULT_ROLES,
  resolvePermissionKeysForRole,
} = require('../helpers/defaultRoles.helper');
const { moduleKeyFromPermissionKey } = require('../helpers/permissionKey.helper');

/**
 * Idempotent RBAC seed: permissions, roles, role links, and first super_admin assignment.
 */
async function seedRbac() {
  const summary = {
    permissions: { created: [], updated: [] },
    roles: { created: [], updated: [] },
    rolePermissions: { linked: [] },
    accountRoles: { assigned: [] },
  };

  const moduleRows = await moduleRepository.listModules({ includeDeleted: false });
  const moduleByKey = Object.fromEntries(moduleRows.map((row) => [row.key, row]));

  for (const seed of DEFAULT_PERMISSIONS) {
    const moduleKey = moduleKeyFromPermissionKey(seed.key);
    const moduleDoc = moduleByKey[moduleKey];
    if (!moduleDoc) continue;

    const existing = await permissionRepository.findByKey(seed.key, { includeDeleted: true });

    if (!existing) {
      await permissionRepository.createPermission({
        moduleId: moduleDoc._id,
        key: seed.key,
        name: seed.name,
        description: seed.description,
        category: seed.category,
        status: 'active',
        isSystem: true,
      });
      summary.permissions.created.push(seed.key);
      continue;
    }

    if (!existing.isSystem) continue;

    await permissionRepository.updatePermission(existing._id, {
      moduleId: moduleDoc._id,
      name: seed.name,
      description: seed.description,
      category: seed.category,
      status: 'active',
      isSystem: true,
      isDeleted: false,
      deletedAt: null,
    });
    summary.permissions.updated.push(seed.key);
  }

  const activePermissions = await permissionRepository.listActivePermissions();
  const permissionsByKey = Object.fromEntries(activePermissions.map((row) => [row.key, row]));
  const allPermissionKeys = activePermissions.map((row) => row.key);

  for (const seed of DEFAULT_ROLES) {
    const existing = await roleRepository.findByKey(seed.key, { includeDeleted: true });

    if (!existing) {
      await roleRepository.createRole({
        key: seed.key,
        name: seed.name,
        description: seed.description,
        status: 'active',
        priority: seed.priority,
        isSystem: true,
      });
      summary.roles.created.push(seed.key);
      continue;
    }

    if (!existing.isSystem) continue;

    await roleRepository.updateRole(existing._id, {
      name: seed.name,
      description: seed.description,
      status: 'active',
      priority: seed.priority,
      isSystem: true,
      isDeleted: false,
      deletedAt: null,
    });
    summary.roles.updated.push(seed.key);
  }

  for (const seed of DEFAULT_ROLES) {
    const role = await roleRepository.findByKey(seed.key);
    if (!role) continue;

    const keysForRole = resolvePermissionKeysForRole(role.key, allPermissionKeys, permissionsByKey);

    for (const permissionKey of keysForRole) {
      const permission = permissionsByKey[permissionKey];
      if (!permission) continue;

      const existingLink = await rolePermissionRepository.findByRoleAndPermission(role._id, permission._id);
      if (!existingLink) {
        await rolePermissionRepository.createRolePermission({
          roleId: role._id,
          permissionId: permission._id,
        });
        summary.rolePermissions.linked.push(`${role.key}:${permissionKey}`);
      }
    }
  }

  async function assignRoleToAccountsByType(roleKey, accountType) {
    const role = await roleRepository.findByKey(roleKey);
    if (!role) return;

    const accounts = await accountRepository.findAllByAccountType(accountType);
    for (const account of accounts) {
      const existingAssignment = await accountRoleRepository.findByAccountAndRole(
        account._id,
        role._id
      );

      if (!existingAssignment) {
        await accountRoleRepository.createAccountRole({
          accountId: account._id,
          roleId: role._id,
          assignedBy: null,
          assignedAt: new Date(),
          status: 'active',
        });
        summary.accountRoles.assigned.push(`${roleKey}:${account._id}`);
      }
    }
  }

  await assignRoleToAccountsByType('super_admin', 'super_admin');
  await assignRoleToAccountsByType('admin', 'admin');
  await assignRoleToAccountsByType('manager', 'manager');
  await assignRoleToAccountsByType('employee', 'employee');
  await assignRoleToAccountsByType('client', 'client');

  info('PTS v2 RBAC seed completed', summary);
  return summary;
}

module.exports = {
  seedRbac,
};
