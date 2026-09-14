function hasRequiredPermissions(accountPermissions, requiredPermissions, mode = 'all') {
  const keys = (Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions])
    .filter(Boolean);

  if (!keys.length) return true;

  return mode === 'any'
    ? keys.some((key) => accountPermissions.includes(key))
    : keys.every((key) => accountPermissions.includes(key));
}

function hasSessionRole(v2Auth, roleKey) {
  const roles = v2Auth?.sessionAccess?.roles || [];
  return roles.some((role) => (typeof role === 'string' ? role : role?.key) === roleKey);
}

function isSuperAdmin(v2Auth) {
  return v2Auth?.account?.accountType === 'super_admin'
    || hasSessionRole(v2Auth, 'super_admin');
}

module.exports = {
  hasRequiredPermissions,
  hasSessionRole,
  isSuperAdmin,
};
