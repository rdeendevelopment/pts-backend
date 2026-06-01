const ROLE_STATUSES = ['active', 'inactive'];
const PERMISSION_STATUSES = ['active', 'inactive', 'deprecated'];
const PERMISSION_CATEGORIES = ['view', 'create', 'update', 'delete', 'manage', 'system'];
const ACCOUNT_ROLE_STATUSES = ['active', 'inactive'];

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

const DEFAULT_ROLE_KEYS = ['super_admin', 'admin', 'manager', 'employee'];

module.exports = {
  ROLE_STATUSES,
  PERMISSION_STATUSES,
  PERMISSION_CATEGORIES,
  ACCOUNT_ROLE_STATUSES,
  ROLE_KEY_PATTERN,
  PERMISSION_KEY_PATTERN,
  DEFAULT_ROLE_KEYS,
};
