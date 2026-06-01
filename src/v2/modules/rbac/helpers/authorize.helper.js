function hasRequiredPermissions(accountPermissions, requiredPermissions, mode = 'all') {
  const keys = (Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions])
    .filter(Boolean);

  if (!keys.length) return true;

  return mode === 'any'
    ? keys.some((key) => accountPermissions.includes(key))
    : keys.every((key) => accountPermissions.includes(key));
}

module.exports = {
  hasRequiredPermissions,
};
