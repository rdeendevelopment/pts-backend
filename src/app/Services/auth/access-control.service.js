const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const constants = require('../../../../config/constants');
const coreMongo = require('../../Repositories/core-mongo.repository');

const ROLE_HIERARCHY = {
  SUPER_ADMIN: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'],
  ADMIN: ['ADMIN', 'MANAGER', 'EMPLOYEE'],
  MANAGER: ['MANAGER', 'EMPLOYEE'],
  EMPLOYEE: ['EMPLOYEE'],
};

const MODULES = [
  'dashboard',
  'projects',
  'tasks',
  'time_clock',
  'employees',
  'clients',
  'reports',
  'settings',
];

const ROLE_MODULES = {
  EMPLOYEE: ['dashboard', 'projects', 'tasks', 'time_clock', 'reports'],
  MANAGER: ['dashboard', 'projects', 'tasks', 'time_clock', 'employees', 'clients', 'reports'],
  ADMIN: ['dashboard', 'projects', 'tasks', 'time_clock', 'employees', 'clients', 'reports', 'settings'],
  SUPER_ADMIN: MODULES,
};

const ROLE_PERMISSIONS = {
  EMPLOYEE: [
    'projects.view',
    'projects.view_budget',
    'projects.request_budget_hours',
    'tasks.view',
    'tasks.create',
    'tasks.update_own',
    'time.view_own',
    'time.create',
    'time.update_own',
    'time.submit',
    'reports.view_own',
  ],
  MANAGER: [
    'projects.create',
    'projects.update',
    'projects.assign_users',
    'projects.manage_budget',
    'projects.approve_budget_request',
    'tasks.update_all',
    'tasks.assign',
    'time.view_team',
    'time.approve',
    'time.reject',
    'reports.view_team',
    'employees.view',
    'clients.view',
  ],
  ADMIN: [
    'projects.delete',
    'tasks.delete',
    'time.view_all',
    'reports.view_all',
    'employees.create',
    'employees.update',
    'employees.deactivate',
    'employees.assign_roles',
    'clients.create',
    'clients.update',
    'clients.delete',
    'settings.view',
  ],
  SUPER_ADMIN: ['settings.manage_modules', 'settings.manage_permissions'],
};

function normalizeRole(role) {
  const value = String(role || '').trim().replace(/-/g, '_').toUpperCase();
  if (value === 'SUPERADMIN') return 'SUPER_ADMIN';
  if (value === 'USER') return 'EMPLOYEE';
  return ROLE_HIERARCHY[value] ? value : 'EMPLOYEE';
}

function expandRoles(roles) {
  const expanded = new Set();
  roles.map(normalizeRole).forEach((role) => {
    (ROLE_HIERARCHY[role] || [role]).forEach((item) => expanded.add(item));
  });
  return Array.from(expanded);
}

function uniqueFromRoleMap(roles, map) {
  const values = new Set();
  roles.forEach((role) => (map[role] || []).forEach((item) => values.add(item)));
  return Array.from(values);
}

function displayName(account) {
  return account.name || [account.first_name, account.last_name].filter(Boolean).join(' ') || account.user_name || account.email || '';
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function getUserRoles(accountType, account) {
  const fallback = accountType === 'admin' ? normalizeRole(account.type || 'SUPER_ADMIN') : normalizeRole(account.role || 'EMPLOYEE');
  try {
    const mongoRoles = await coreMongo.getMongoRolesForAccount(accountType, account);
    if (mongoRoles?.length) return expandRoles(mongoRoles);
  } catch (err) {
    // Static fallback keeps seeded and legacy accounts working.
  }
  return expandRoles([fallback]);
}

async function loadAccess(accountType, account) {
  const roles = await getUserRoles(accountType, account);
  let modules = uniqueFromRoleMap(roles, ROLE_MODULES);
  let permissions = uniqueFromRoleMap(roles, ROLE_PERMISSIONS);

  try {
    const [mongoModules, mongoPermissions] = await Promise.all([
      coreMongo.getMongoModulesForRoles(roles),
      coreMongo.getMongoPermissionsForRoles(roles),
    ]);
    if (mongoModules?.length) modules = mongoModules;
    if (mongoPermissions?.length) permissions = mongoPermissions;
  } catch (err) {
    // Static maps keep access usable if RBAC seed data is missing.
  }

  return { roles, modules, permissions };
}

function buildUser(accountType, account, roles) {
  return {
    id: account.id,
    name: displayName(account),
    first_name: account.first_name || account.firstName || account.name || '',
    last_name: account.last_name || account.lastName || '',
    user_name: account.user_name || account.userName || '',
    contact: account.contact || '',
    email: account.email,
    roles,
    role: roles[0],
    accountType,
    image_url: account.image_url || account.imageUrl || '',
    must_change_password: Boolean(account.must_change_password || account.mustChangePassword),
  };
}

function signAccessToken(accountType, account, access) {
  const primaryRole = access.roles[0] || 'EMPLOYEE';
  const legacyRole = primaryRole === 'SUPER_ADMIN' ? 'super-admin' : primaryRole.toLowerCase();
  return jwt.sign(
    {
      user: {
        id: account.id,
        role: legacyRole,
        roles: access.roles,
        email: account.email,
        accountType,
      },
    },
    constants.APP_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

async function createRefreshToken(accountType, account) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  const hash = tokenHash(token);

  await coreMongo.createRefreshToken(accountType, account, hash, expiresAt);

  return token;
}

async function buildAuthResponse(accountType, account, options = {}) {
  const access = await loadAccess(accountType, account);
  const accessToken = signAccessToken(accountType, account, access);
  const refreshToken = options.includeRefresh === false ? null : await createRefreshToken(accountType, account);
  const user = buildUser(accountType, account, access.roles);

  const response = {
    accessToken,
    token: accessToken,
    user,
    modules: access.modules,
    permissions: access.permissions,
  };

  if (refreshToken) response.refreshToken = refreshToken;
  return response;
}

async function findAccountFromTokenPayload(payload) {
  const accountType = payload?.user?.accountType || (payload?.user?.role === 'super-admin' ? 'admin' : 'user');
  const id = payload?.user?.id;
  if (!id) return null;

  return coreMongo.findAccountFromToken(accountType, id);
}

async function findLoginAccount(email) {
  return coreMongo.findLoginAccount(email);
}

module.exports = {
  ROLE_HIERARCHY,
  ROLE_MODULES,
  ROLE_PERMISSIONS,
  buildAuthResponse,
  createRefreshToken,
  expandRoles,
  findAccountFromTokenPayload,
  findLoginAccount,
  loadAccess,
  normalizeRole,
  tokenHash,
};
