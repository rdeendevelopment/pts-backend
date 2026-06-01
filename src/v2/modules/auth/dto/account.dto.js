function toAccountDto(account) {
  if (!account) return null;

  const row = account.toObject ? account.toObject() : account;

  return {
    id: String(row._id),
    username: row.username || null,
    email: row.email,
    first_name: row.firstName,
    last_name: row.lastName,
    status: row.status,
    account_type: row.accountType,
    last_login_at: row.lastLoginAt || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toAuthSessionDto({
  account,
  accessToken,
  refreshToken,
  expiresIn,
  roles = [],
  permissions = [],
  modules = [],
  user = null,
}) {
  return {
    account: toAccountDto(account),
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    token_type: 'Bearer',
    user,
    roles,
    permissions,
    modules,
  };
}

module.exports = {
  toAccountDto,
  toAuthSessionDto,
};
