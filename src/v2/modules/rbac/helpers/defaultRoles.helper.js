const DEFAULT_ROLES = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full platform access including system permissions.',
    priority: 10,
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Platform administration without system-only permissions.',
    priority: 20,
  },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Manage delivery work across projects, tasks, and reporting.',
    priority: 30,
  },
  {
    key: 'employee',
    name: 'Employee',
    description: 'Standard user access to assigned work modules.',
    priority: 40,
  },
];

const MANAGER_PERMISSION_KEYS = [
  'auth.me',
  'modules.view',
  'projects.view',
  'projects.manage',
  'assignments.view',
  'assignments.manage',
  'budgets.view',
  'budgets.manage',
  'activity.view',
  'activity.manage',
  'tasks.view',
  'tasks.manage',
  'converse.view',
  'converse.manage',
  'reports.view',
  'reports.manage',
];

const EMPLOYEE_PERMISSION_KEYS = [
  'auth.me',
  'modules.view',
  'projects.view',
  'budgets.view',
  'activity.view',
  'tasks.view',
  'converse.view',
];

function resolvePermissionKeysForRole(roleKey, allPermissionKeys, permissionsByKey) {
  if (roleKey === 'super_admin') {
    return allPermissionKeys;
  }

  if (roleKey === 'admin') {
    return allPermissionKeys.filter((key) => permissionsByKey[key]?.category !== 'system');
  }

  if (roleKey === 'manager') {
    return MANAGER_PERMISSION_KEYS.filter((key) => allPermissionKeys.includes(key));
  }

  if (roleKey === 'employee') {
    return EMPLOYEE_PERMISSION_KEYS.filter((key) => allPermissionKeys.includes(key));
  }

  return [];
}

module.exports = {
  DEFAULT_ROLES,
  MANAGER_PERMISSION_KEYS,
  EMPLOYEE_PERMISSION_KEYS,
  resolvePermissionKeysForRole,
};
