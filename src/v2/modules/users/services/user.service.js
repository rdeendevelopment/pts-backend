const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const {
  USER_STATUSES,
  EMPLOYMENT_TYPES,
  DEFAULT_TIMEZONE,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
} = require('../constants/users.constants');
const userErrorCodes = require('../errors/userErrorCodes');
const { buildDisplayName } = require('../helpers/displayName.helper');
const {
  decodeCursor,
  encodeCursor,
  parseLimit,
  parsePage,
  buildPaginationMeta,
} = require('../helpers/pagination.helper');
const accountRepository = require('../../auth/repositories/account.repository');
const clientRepository = require('../../clients/repositories/client.repository');
const passwordService = require('../../auth/services/password.service');
const userRepository = require('../repositories/user.repository');
const rbacAccessService = require('../../rbac/services/rbacAccess.service');
const { toUserDto, toUserSummaryDto } = require('../dto/user.dto');

const INTERNAL_ACCOUNT_TYPES = new Set(['super_admin', 'admin', 'manager', 'employee']);

function mergeAccountFields(userDoc, accountDoc) {
  if (!userDoc || !accountDoc) return userDoc;
  const user = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  const account = accountDoc.toObject ? accountDoc.toObject() : accountDoc;
  return {
    ...user,
    accountType: account.accountType || null,
    clientId: account.clientId || null,
  };
}

function normalizeEmail(email) {
  const normalized = String(email || '').toLowerCase().trim();
  return normalized || null;
}

function normalizeUsername(username) {
  const normalized = String(username || '').toLowerCase().trim();
  return normalized || null;
}

function resolveUsernameFromPayload(payload = {}) {
  return normalizeUsername(
    payload.username
    || payload.user_name
    || payload.userName
  );
}

function assertValidStatus(status) {
  if (!USER_STATUSES.includes(status)) {
    throw new AppError('Invalid user status', {
      status: 400,
      code: userErrorCodes.USER_INVALID_STATUS,
      details: { allowed: USER_STATUSES },
    });
  }
}

function assertValidEmploymentType(value) {
  if (value && !EMPLOYMENT_TYPES.includes(value)) {
    throw new AppError('Invalid employment type', {
      status: 400,
      code: userErrorCodes.USER_INVALID_STATUS,
      details: { allowed: EMPLOYMENT_TYPES, field: 'employmentType' },
    });
  }
}

async function getUserOrThrow(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', {
      status: 404,
      code: userErrorCodes.USER_NOT_FOUND,
    });
  }
  return user;
}

async function assertManagerValid(managerId, userId = null) {
  if (!managerId) return null;

  if (userId && String(managerId) === String(userId)) {
    throw new AppError('A user cannot be their own manager', {
      status: 400,
      code: userErrorCodes.USER_SELF_MANAGER_NOT_ALLOWED,
    });
  }

  const manager = await userRepository.findById(managerId);
  if (!manager || manager.status !== 'active') {
    throw new AppError('Manager not found or inactive', {
      status: 400,
      code: userErrorCodes.USER_MANAGER_NOT_FOUND,
    });
  }

  return manager;
}

async function assertEmailAvailable(email, { excludeAccountId = null, excludeUserId = null } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  const existingAccount = await accountRepository.findByEmail(normalized);
  if (existingAccount && (!excludeAccountId || String(existingAccount._id) !== String(excludeAccountId))) {
    throw new AppError('Email is already in use', {
      status: 409,
      code: userErrorCodes.USER_EMAIL_ALREADY_EXISTS,
      details: { email: normalized },
    });
  }

  const existingUser = await userRepository.findByEmail(normalized);
  if (existingUser && (!excludeUserId || String(existingUser._id) !== String(excludeUserId))) {
    throw new AppError('Email is already in use', {
      status: 409,
      code: userErrorCodes.USER_EMAIL_ALREADY_EXISTS,
      details: { email: normalized },
    });
  }
}

async function assertUsernameAvailable(username, { excludeAccountId = null, excludeUserId = null } = {}) {
  const normalized = normalizeUsername(username);
  if (!normalized) return;

  const existingAccount = await accountRepository.findByUsername(normalized);
  if (existingAccount && (!excludeAccountId || String(existingAccount._id) !== String(excludeAccountId))) {
    throw new AppError('Username is already in use', {
      status: 409,
      code: userErrorCodes.USER_USERNAME_ALREADY_EXISTS,
      details: { username: normalized },
    });
  }

  const existingUser = await userRepository.findByUsername(normalized);
  if (existingUser && (!excludeUserId || String(existingUser._id) !== String(excludeUserId))) {
    throw new AppError('Username is already in use', {
      status: 409,
      code: userErrorCodes.USER_USERNAME_ALREADY_EXISTS,
      details: { username: normalized },
    });
  }
}

function resolveAccountType(payload) {
  return String(payload.accountType || payload.account_type || 'employee').trim().toLowerCase();
}

function assertInternalAccountType(accountType) {
  if (!INTERNAL_ACCOUNT_TYPES.has(accountType)) {
    throw new AppError('Client accounts must be managed as client contacts, not users', {
      status: 400,
      code: userErrorCodes.USER_INVALID_STATUS,
      details: {
        accountType,
        hint: 'Use /clients/:clientId/contacts for client portal logins.',
      },
    });
  }
}

async function assertUserAccountIsInternal(user) {
  const account = await accountRepository.findById(user.accountId);
  if (account?.accountType === 'client') {
    throw new AppError('Client accounts must be managed as client contacts, not users', {
      status: 404,
      code: userErrorCodes.USER_NOT_FOUND,
      details: {
        hint: 'Use /clients/:clientId/contacts for client portal logins.',
      },
    });
  }
  return account;
}

async function resolveClientIdForAccountType(accountType, rawClientId) {
  if (accountType !== 'client') return null;
  const clientId = assertObjectId(rawClientId, 'clientId');
  const client = await clientRepository.findById(clientId);
  if (!client || client.isDeleted) {
    throw new AppError('Client not found', {
      status: 404,
      code: userErrorCodes.USER_INVALID_STATUS,
      details: { clientId: String(clientId) },
    });
  }
  return clientId;
}

async function resolveAccountForCreate(payload) {
  if (payload.accountId || payload.account_id) {
    const accountId = payload.accountId || payload.account_id;
    const account = await accountRepository.findById(accountId);
    if (!account) {
      throw new AppError('Linked account not found', {
        status: 404,
        code: userErrorCodes.USER_ACCOUNT_NOT_FOUND,
      });
    }

    assertInternalAccountType(account.accountType || 'employee');

    const existingUser = await userRepository.findByAccountId(accountId);
    if (existingUser) {
      throw new AppError('Account is already linked to another user profile', {
        status: 409,
        code: userErrorCodes.USER_ACCOUNT_ALREADY_LINKED,
        details: { accountId: String(accountId) },
      });
    }

    return account;
  }

  const username = resolveUsernameFromPayload(payload);
  if (!username) {
    throw new AppError('Username is required when creating a new account', {
      status: 400,
      code: userErrorCodes.USER_USERNAME_REQUIRED,
      details: { hint: 'Provide username and password to create a login account.' },
    });
  }

  if (!payload.password) {
    throw new AppError('Password is required when creating a new account', {
      status: 400,
      code: userErrorCodes.USER_ACCOUNT_NOT_FOUND,
      details: { hint: 'Provide password or an existing accountId.' },
    });
  }

  const email = normalizeEmail(payload.email);
  await assertUsernameAvailable(username);
  if (email) {
    await assertEmailAvailable(email);
  }

  const firstName = String(payload.firstName || payload.first_name).trim();
  const lastName = String(payload.lastName || payload.last_name).trim();
  const passwordHash = await passwordService.hashPassword(payload.password);
  const status = payload.status && USER_STATUSES.includes(payload.status) ? payload.status : 'active';
  const accountType = resolveAccountType(payload);
  assertInternalAccountType(accountType);
  const clientId = await resolveClientIdForAccountType(
    accountType,
    payload.clientId || payload.client_id,
  );

  if (accountType === 'client' && !clientId) {
    throw new AppError('clientId is required for client accounts', {
      status: 400,
      code: userErrorCodes.USER_INVALID_STATUS,
      details: { field: 'clientId' },
    });
  }

  return accountRepository.createAccount({
    username,
    email,
    passwordHash,
    firstName,
    lastName,
    status,
    accountType,
    clientId,
  });
}

function resolveIdentityFromAccount(account) {
  const email = normalizeEmail(account?.email || '');
  const username = normalizeUsername(account?.username || '');
  const emailLocal = email?.includes('@') ? email.split('@')[0] : (username || 'user');

  const firstName = String(account?.firstName || '').trim() || emailLocal;
  const lastName = String(account?.lastName || '').trim() || 'User';
  const displayName = buildDisplayName(firstName, lastName, null) || username || email || 'User';

  return { firstName, lastName, displayName, email, username };
}

function buildUserPayload(payload, account, { forUpdate = false } = {}) {
  const hasPayloadFirst = payload.firstName !== undefined || payload.first_name !== undefined;
  const hasPayloadLast = payload.lastName !== undefined || payload.last_name !== undefined;

  let firstName = hasPayloadFirst
    ? String(payload.firstName ?? payload.first_name).trim()
    : undefined;
  let lastName = hasPayloadLast
    ? String(payload.lastName ?? payload.last_name).trim()
    : undefined;

  if (!forUpdate && account) {
    if (firstName === undefined) firstName = String(account.firstName || '').trim();
    if (lastName === undefined) lastName = String(account.lastName || '').trim();
  }

  const data = {};

  if (firstName !== undefined) data.firstName = firstName;
  if (lastName !== undefined) data.lastName = lastName;

  if (payload.email !== undefined) data.email = normalizeEmail(payload.email);
  else if (!forUpdate && account?.email) data.email = normalizeEmail(account.email);

  const username = resolveUsernameFromPayload(payload);
  if (username) {
    data.username = username;
  } else if (!forUpdate && account?.username) {
    data.username = normalizeUsername(account.username);
  }

  if (payload.displayName !== undefined || payload.display_name !== undefined) {
    data.displayName = buildDisplayName(
      firstName ?? payload.firstName ?? payload.first_name,
      lastName ?? payload.lastName ?? payload.last_name,
      payload.displayName ?? payload.display_name
    );
  } else if (firstName !== undefined || lastName !== undefined) {
    const currentFirst = firstName ?? payload.firstName;
    const currentLast = lastName ?? payload.last_name;
    data.displayName = buildDisplayName(currentFirst, currentLast, null);
  } else if (!forUpdate) {
    const accountIdentity = account ? resolveIdentityFromAccount(account) : null;
    data.displayName = buildDisplayName(
      data.firstName || payload.firstName || payload.first_name || accountIdentity?.firstName,
      data.lastName || payload.lastName || payload.last_name || accountIdentity?.lastName,
      payload.displayName || payload.display_name
    ) || accountIdentity?.displayName;
  }

  if (!forUpdate) {
    const accountIdentity = account ? resolveIdentityFromAccount(account) : null;
    if (!data.firstName?.trim() && accountIdentity) data.firstName = accountIdentity.firstName;
    if (!data.lastName?.trim() && accountIdentity) data.lastName = accountIdentity.lastName;
    if (!data.displayName?.trim() && accountIdentity) data.displayName = accountIdentity.displayName;
  }

  if (payload.phone !== undefined) data.phone = payload.phone || null;
  else if (payload.contact !== undefined) data.phone = payload.contact || null;
  if (payload.avatarUrl !== undefined || payload.avatar_url !== undefined) {
    data.avatarUrl = payload.avatarUrl || payload.avatar_url || null;
  }
  if (payload.jobTitle !== undefined || payload.job_title !== undefined) {
    data.jobTitle = payload.jobTitle || payload.job_title || null;
  }
  if (payload.department !== undefined) data.department = payload.department || null;
  if (payload.employmentType !== undefined || payload.employment_type !== undefined) {
    const value = payload.employmentType || payload.employment_type;
    assertValidEmploymentType(value);
    data.employmentType = value;
  }
  if (payload.managerId !== undefined || payload.manager_id !== undefined) {
    data.managerId = payload.managerId || payload.manager_id || null;
  }
  if (payload.joiningDate !== undefined || payload.joining_date !== undefined) {
    const raw = payload.joiningDate ?? payload.joining_date;
    data.joiningDate = raw ? new Date(raw) : null;
  }
  if (payload.timezone !== undefined) data.timezone = payload.timezone || DEFAULT_TIMEZONE;
  if (payload.notes !== undefined) data.notes = payload.notes || null;
  if (payload.status !== undefined) {
    assertValidStatus(payload.status);
    data.status = payload.status;
  } else if (!forUpdate) {
    data.status = 'active';
  }

  return data;
}

function resolveListSort(query = {}) {
  const rawField = String(query.sort_by || query.sortBy || '').trim();
  const rawOrder = String(query.sort_order || query.sortOrder || '').toLowerCase();
  const direction = rawOrder === 'asc' ? 1 : -1;
  const sortMap = {
    user_identity: 'displayName',
    display_name: 'displayName',
    displayName: 'displayName',
    name: 'displayName',
    user_name: 'username',
    username: 'username',
    email: 'email',
    status: 'status',
    created_at: 'createdAt',
    createdAt: 'createdAt',
  };
  const field = sortMap[rawField] || 'createdAt';
  return { [field]: direction, _id: direction };
}

async function enrichUserRows(items, includeRoles) {
  const accountIds = items.map((row) => row.accountId).filter(Boolean);
  const accounts = await accountRepository.findByIds(accountIds);
  const accountsById = new Map(accounts.map((account) => [String(account._id), account]));

  let mappedItems = items.map((row) => toUserDto(
    mergeAccountFields(row, accountsById.get(String(row.accountId)))
  ));

  if (includeRoles && mappedItems.length) {
    const rolesByAccountId = await rbacAccessService.getSessionRolesForAccounts(
      mappedItems.map((row) => row.account_id)
    );
    mappedItems = mappedItems.map((row) => ({
      ...row,
      roles: rolesByAccountId.get(String(row.account_id)) || [],
    }));
  }

  return mappedItems;
}

async function listUsers(query = {}) {
  const limit = parseLimit(query.limit, {
    defaultLimit: DEFAULT_LIST_LIMIT,
    maxLimit: MAX_LIST_LIMIT,
  });
  const cursor = decodeCursor(query.cursor);

  const filters = {
    search: query.search,
    status: query.status,
    department: query.department,
    employmentType: query.employmentType || query.employment_type,
    managerId: query.managerId || query.manager_id || null,
  };

  const clientAccounts = await accountRepository.findAllByAccountType('client', { activeOnly: false });
  filters.excludeAccountIds = clientAccounts.map((account) => account._id);

  if (filters.managerId) {
    filters.managerId = assertObjectId(filters.managerId, 'managerId');
  }

  const includeRoles = String(query.includeRoles || query.include_roles || '').toLowerCase() === 'true';
  const pageRequested = query.page !== undefined && query.page !== null && query.page !== '';

  if (pageRequested && !query.cursor) {
    const page = parsePage(query.page);
    const { items, total } = await userRepository.listUsersPage(filters, {
      limit,
      skip: (page - 1) * limit,
      sort: resolveListSort(query),
    });

    return {
      items: await enrichUserRows(items, includeRoles),
      pagination: buildPaginationMeta({ page, limit, total }),
    };
  }

  const { items, nextCursor, hasMore } = await userRepository.listUsers(filters, { limit, cursor });

  return {
    items: await enrichUserRows(items, includeRoles),
    pagination: {
      limit,
      has_more: hasMore,
      next_cursor: nextCursor ? encodeCursor(nextCursor) : null,
    },
  };
}

async function getUserById(userId) {
  const user = await getUserOrThrow(userId);
  const account = await assertUserAccountIsInternal(user);
  return toUserDto(mergeAccountFields(user, account));
}

async function getMyProfile(accountId) {
  const user = await userRepository.findByAccountId(accountId);
  if (!user) {
    throw new AppError('User profile not found for this account', {
      status: 404,
      code: userErrorCodes.USER_PROFILE_NOT_FOUND,
    });
  }
  return toUserDto(user);
}

async function getUserSummaryForAccount(accountId) {
  const user = await userRepository.findByAccountId(accountId);
  return user ? toUserSummaryDto(user) : null;
}

/**
 * Ensures a pts_users profile exists for an authenticated account.
 * Links an existing profile by email when accountId was never set (legacy/migrated accounts).
 */
async function ensureUserProfileForAccount(accountId) {
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const existing = await userRepository.findByAccountId(normalizedAccountId);
  if (existing) return existing;

  const account = await accountRepository.findById(normalizedAccountId);
  if (!account || account.isDeleted) {
    throw new AppError('Account not found', {
      status: 404,
      code: userErrorCodes.USER_ACCOUNT_NOT_FOUND,
    });
  }
  assertInternalAccountType(account.accountType || 'employee');

  const email = normalizeEmail(account.email);
  const byEmail = email ? await userRepository.findByEmail(email) : null;

  if (byEmail) {
    if (!byEmail.accountId) {
      const linked = await userRepository.updateUser(byEmail._id, { accountId: account._id });
      return linked || byEmail;
    }
    if (String(byEmail.accountId) === String(account._id)) {
      return byEmail;
    }
  }

  const identity = resolveIdentityFromAccount(account);
  const userData = buildUserPayload({
    firstName: identity.firstName,
    lastName: identity.lastName,
    displayName: identity.displayName,
    email: identity.email,
    username: identity.username,
  }, account);
  userData.accountId = account._id;
  userData.email = identity.email || userData.email || null;
  userData.username = identity.username || userData.username || null;
  userData.status = account.status === 'active' ? 'active' : 'inactive';

  return userRepository.createUser(userData);
}

async function createUser(payload) {
  const account = await resolveAccountForCreate(payload);
  const email = normalizeEmail(payload.email || account.email);
  const username = resolveUsernameFromPayload(payload) || normalizeUsername(account.username);

  if (email) {
    await assertEmailAvailable(email, { excludeAccountId: account._id });
  }
  if (username) {
    await assertUsernameAvailable(username, { excludeAccountId: account._id });
  }

  const userData = buildUserPayload({ ...payload, email, username }, account);
  userData.accountId = account._id;

  if (userData.managerId) {
    await assertManagerValid(userData.managerId);
  }

  const user = await userRepository.createUser(userData);

  const accountUpdates = {};
  if (email && email !== account.email) accountUpdates.email = email;
  if (username && username !== account.username) accountUpdates.username = username;
  if (Object.keys(accountUpdates).length) {
    await accountRepository.updateAccount(account._id, accountUpdates);
  }

  return toUserDto(user);
}

async function updateUser(userId, payload) {
  const user = await getUserOrThrow(userId);
  const updates = buildUserPayload(payload, user, { forUpdate: true });
  const account = await assertUserAccountIsInternal(user);

  if (updates.email && updates.email !== user.email) {
    await assertEmailAvailable(updates.email, {
      excludeAccountId: user.accountId,
      excludeUserId: user._id,
    });
  }

  const nextUsername = resolveUsernameFromPayload(payload);
  if (nextUsername && nextUsername !== normalizeUsername(user.username)) {
    await assertUsernameAvailable(nextUsername, {
      excludeAccountId: user.accountId,
      excludeUserId: user._id,
    });
    updates.username = nextUsername;
  }

  const accountUpdates = {};
  if (updates.email !== undefined && updates.email !== user.email) {
    accountUpdates.email = updates.email;
  }
  if (updates.username && updates.username !== normalizeUsername(user.username)) {
    accountUpdates.username = updates.username;
  }
  if (payload.accountType !== undefined || payload.account_type !== undefined) {
    const accountType = resolveAccountType(payload);
    assertInternalAccountType(accountType);
    const clientId = await resolveClientIdForAccountType(
      accountType,
      payload.clientId || payload.client_id,
    );
    accountUpdates.accountType = accountType;
    accountUpdates.clientId = clientId;
  }
  if (Object.keys(accountUpdates).length) {
    await accountRepository.updateAccount(user.accountId, accountUpdates);
  }

  if (updates.managerId !== undefined) {
    await assertManagerValid(updates.managerId, user._id);
  }

  if (updates.firstName !== undefined || updates.lastName !== undefined) {
    updates.displayName = buildDisplayName(
      updates.firstName ?? user.firstName,
      updates.lastName ?? user.lastName,
      updates.displayName ?? user.displayName
    );
  }

  const updated = await userRepository.updateUser(user._id, updates);
  const updatedAccount = Object.keys(accountUpdates).length
    ? await accountRepository.findById(user.accountId)
    : account;
  return toUserDto(mergeAccountFields(updated, updatedAccount));
}

async function updateUserStatus(userId, status) {
  assertValidStatus(status);
  const user = await getUserOrThrow(userId);
  await assertUserAccountIsInternal(user);

  const updated = await userRepository.updateUser(user._id, { status });
  await accountRepository.updateAccountStatus(user.accountId, status);

  return toUserDto(updated);
}

async function deleteUser(userId, { force = false } = {}) {
  const user = await getUserOrThrow(userId);
  await assertUserAccountIsInternal(user);
  const directReports = await userRepository.countActiveDirectReports(user._id);

  if (directReports > 0 && !force) {
    throw new AppError('User has active direct reports', {
      status: 409,
      code: userErrorCodes.USER_HAS_DIRECT_REPORTS,
      details: { count: directReports, hint: 'Retry with force=true to reassign reports.' },
    });
  }

  if (directReports > 0 && force) {
    await userRepository.clearManagerForDirectReports(user._id);
  }

  await userRepository.softDeleteUser(user._id);
  await accountRepository.updateAccount(user.accountId, {
    status: 'inactive',
    username: null,
  });

  return { deleted: true, id: String(user._id), forced: Boolean(force) };
}

function resolvePasswordValue(payload = {}) {
  return payload.password || payload.newPassword || payload.new_password;
}

async function applyAccountPassword(accountId, password, { mustChange = false } = {}) {
  if (!password || String(password).length < 8) {
    throw new AppError('Password must be at least 8 characters', {
      status: 400,
      code: userErrorCodes.USER_INVALID_STATUS,
      details: { field: 'password', minLength: 8 },
    });
  }

  const passwordHash = await passwordService.hashPassword(String(password));
  await accountRepository.updateAccount(accountId, {
    passwordHash,
    security: {
      passwordResetRequired: Boolean(mustChange),
      passwordMigrated: true,
    },
  });
}

async function resetUserPassword(userId, payload = {}) {
  const user = await getUserOrThrow(userId);
  await assertUserAccountIsInternal(user);
  await applyAccountPassword(user.accountId, resolvePasswordValue(payload), {
    mustChange: Boolean(payload.mustChangePassword ?? payload.must_change_password),
  });
  return { updated: true, id: String(user._id) };
}

async function changeMyPassword(accountId, payload = {}) {
  const account = await accountRepository.findById(accountId, { includePassword: true });
  if (!account) {
    throw new AppError('Account not found', {
      status: 404,
      code: userErrorCodes.USER_NOT_FOUND,
    });
  }

  const currentPassword = payload.currentPassword || payload.oldPassword || payload.old_password;
  const nextPassword = resolvePasswordValue(payload);

  if (!currentPassword) {
    throw new AppError('Current password is required', {
      status: 400,
      code: userErrorCodes.USER_INVALID_STATUS,
      details: { field: 'currentPassword' },
    });
  }

  const valid = await passwordService.verifyPassword(currentPassword, account.passwordHash);
  if (!valid) {
    throw new AppError('Current password is incorrect', {
      status: 400,
      code: userErrorCodes.USER_INVALID_STATUS,
      details: { field: 'currentPassword' },
    });
  }

  await applyAccountPassword(accountId, nextPassword);
  const user = await userRepository.findByAccountId(accountId);
  return { updated: true, id: user ? String(user._id) : null };
}

async function updateMyProfile(accountId, payload) {
  const user = await userRepository.findByAccountId(accountId);
  if (!user) {
    throw new AppError('User profile not found for this account', {
      status: 404,
      code: userErrorCodes.USER_PROFILE_NOT_FOUND,
    });
  }
  return updateUser(user._id, payload);
}

module.exports = {
  listUsers,
  getUserById,
  getMyProfile,
  getUserSummaryForAccount,
  ensureUserProfileForAccount,
  createUser,
  updateUser,
  updateMyProfile,
  updateUserStatus,
  deleteUser,
  resetUserPassword,
  changeMyPassword,
  assertValidStatus,
};
