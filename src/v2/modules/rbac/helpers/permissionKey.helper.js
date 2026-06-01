const { ROLE_KEY_PATTERN, PERMISSION_KEY_PATTERN } = require('../constants/rbac.constants');

function normalizeRoleKey(key) {
  return String(key || '').trim().toLowerCase();
}

function normalizePermissionKey(key) {
  return String(key || '').trim().toLowerCase();
}

function isValidRoleKey(key) {
  return ROLE_KEY_PATTERN.test(normalizeRoleKey(key));
}

function isValidPermissionKey(key) {
  return PERMISSION_KEY_PATTERN.test(normalizePermissionKey(key));
}

function moduleKeyFromPermissionKey(permissionKey) {
  const normalized = normalizePermissionKey(permissionKey);
  return normalized.split('.')[0] || null;
}

module.exports = {
  normalizeRoleKey,
  normalizePermissionKey,
  isValidRoleKey,
  isValidPermissionKey,
  moduleKeyFromPermissionKey,
};
