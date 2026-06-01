const { AppError } = require('../../../kernel/errors');
const { ROLE_STATUSES } = require('../constants/rbac.constants');
const rbacErrorCodes = require('../errors/rbacErrorCodes');
const { normalizeRoleKey, isValidRoleKey } = require('../helpers/permissionKey.helper');
const roleRepository = require('../repositories/role.repository');
const { toRoleDto } = require('../dto/role.dto');

function assertValidRoleKey(key) {
  const normalized = normalizeRoleKey(key);
  if (!normalized || !isValidRoleKey(normalized)) {
    throw new AppError('Role key must be lowercase snake_case', {
      status: 400,
      code: rbacErrorCodes.RBAC_INVALID_ROLE_KEY,
      details: { key, pattern: 'lowercase letters, numbers, underscores' },
    });
  }
  return normalized;
}

function assertValidRoleStatus(status) {
  if (!ROLE_STATUSES.includes(status)) {
    throw new AppError('Invalid role status', {
      status: 400,
      code: rbacErrorCodes.RBAC_ROLE_NOT_FOUND,
      details: { allowed: ROLE_STATUSES },
    });
  }
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

async function listRoles() {
  const rows = await roleRepository.listRoles();
  return rows.map(toRoleDto);
}

async function getRoleById(roleId) {
  const role = await getRoleOrThrow(roleId);
  return toRoleDto(role);
}

async function createRole(payload) {
  const key = assertValidRoleKey(payload.key);

  const existing = await roleRepository.findByKey(key, { includeDeleted: true });
  if (existing && !existing.isDeleted) {
    throw new AppError('Role key already exists', {
      status: 409,
      code: rbacErrorCodes.RBAC_ROLE_KEY_ALREADY_EXISTS,
      details: { key },
    });
  }

  const role = await roleRepository.createRole({
    key,
    name: String(payload.name).trim(),
    description: payload.description ? String(payload.description).trim() : '',
    status: payload.status || 'active',
    priority: Number(payload.priority ?? 100),
    isSystem: false,
  });

  return toRoleDto(role);
}

async function updateRole(roleId, payload) {
  const role = await getRoleOrThrow(roleId);
  const updates = {};

  if (payload.name !== undefined) updates.name = String(payload.name).trim();
  if (payload.description !== undefined) updates.description = String(payload.description).trim();
  if (payload.status !== undefined) {
    assertValidRoleStatus(payload.status);
    updates.status = payload.status;
  }
  if (payload.priority !== undefined) updates.priority = Number(payload.priority);

  const updated = await roleRepository.updateRole(role._id, updates);
  return toRoleDto(updated);
}

async function deleteRole(roleId) {
  const role = await getRoleOrThrow(roleId);

  if (role.isSystem) {
    throw new AppError('System roles cannot be deleted', {
      status: 409,
      code: rbacErrorCodes.RBAC_SYSTEM_ROLE_DELETE_BLOCKED,
      details: { key: role.key },
    });
  }

  await roleRepository.softDeleteRole(role._id);
  return { deleted: true, id: String(role._id) };
}

module.exports = {
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
};
