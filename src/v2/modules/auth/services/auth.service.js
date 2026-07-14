const { AppError } = require('../../../kernel/errors');
const authConfig = require('../constants/auth.constants');
const authErrorCodes = require('../errors/authErrorCodes');
const accountRepository = require('../repositories/account.repository');
const userRepository = require('../../users/repositories/user.repository');
const refreshTokenRepository = require('../repositories/refresh-token.repository');
const passwordService = require('./password.service');
const tokenService = require('./token.service');
const { getSessionAccessForAccount } = require('../../rbac/services/rbacAccess.service');
const { getUserSummaryForAccount } = require('../../users/services/user.service');
const { getClientSessionForAccount } = require('../../clients/services/clientContact.service');
const { toAccountDto, toAuthSessionDto } = require('../dto/account.dto');

function assertAccountCanAuthenticate(account) {
  if (!account || account.isDeleted) {
    throw new AppError('Unauthorized', {
      status: 401,
      code: authErrorCodes.AUTH_UNAUTHORIZED,
    });
  }

  if (account.status !== 'active') {
    throw new AppError('Account is not active', {
      status: 403,
      code: authErrorCodes.AUTH_ACCOUNT_INACTIVE,
      details: { status: account.status },
    });
  }
}

function requestMeta(req) {
  return {
    createdByIp: req.ip || null,
    userAgent: req.get('user-agent') || null,
  };
}

async function issueSession(account, req) {
  const refresh = tokenService.generateRefreshToken();
  const meta = requestMeta(req);
  const isClientAccount = account.accountType === 'client';
  const [sessionAccess, user, clientSession] = await Promise.all([
    getSessionAccessForAccount(account._id),
    isClientAccount ? null : getUserSummaryForAccount(account._id),
    isClientAccount
      ? getClientSessionForAccount(account)
      : { clientContact: null, client: null },
    refreshTokenRepository.createRefreshToken({
      accountId: account._id,
      tokenHash: refresh.hash,
      familyId: refresh.familyId,
      expiresAt: tokenService.refreshTokenExpiresAt(),
      createdByIp: meta.createdByIp,
      userAgent: meta.userAgent,
    }),
    accountRepository.updateLastLogin(account._id),
  ]);
  const { clientContact, client } = clientSession;
  const accessToken = tokenService.signAccessToken(account, sessionAccess.roles);

  return toAuthSessionDto({
    account,
    accessToken,
    refreshToken: refresh.raw,
    expiresIn: tokenService.getAccessTokenExpiresInSeconds(),
    roles: sessionAccess.roles,
    permissions: sessionAccess.permissions,
    modules: sessionAccess.modules,
    user,
    clientContact,
    client,
  });
}

async function register(payload, req) {
  if (!authConfig.allowPublicRegister) {
    throw new AppError('Public registration is disabled in this environment', {
      status: 403,
      code: authErrorCodes.AUTH_REGISTRATION_DISABLED,
      details: {
        hint: 'Set PTS_V2_ALLOW_PUBLIC_REGISTER=true only when intentional.',
      },
    });
  }

  const email = String(payload.email).toLowerCase().trim();
  const existing = await accountRepository.findByEmail(email);
  if (existing) {
    throw new AppError('Email is already registered', {
      status: 409,
      code: authErrorCodes.AUTH_EMAIL_ALREADY_EXISTS,
    });
  }

  const passwordHash = await passwordService.hashPassword(payload.password);
  const account = await accountRepository.createAccount({
    email,
    passwordHash,
    firstName: String(payload.firstName).trim(),
    lastName: String(payload.lastName).trim(),
    status: 'active',
    accountType: 'employee',
  });

  return issueSession(account, req);
}

function normalizeLoginIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

async function backfillAccountUsername(account, username) {
  const normalized = normalizeLoginIdentifier(username);
  if (!account?._id || !normalized || normalizeLoginIdentifier(account.username) === normalized) {
    return account;
  }

  await accountRepository.updateAccount(account._id, { username: normalized });
  return { ...account, username: normalized };
}

async function resolveAccountForLogin(rawIdentifier) {
  const identifier = normalizeLoginIdentifier(rawIdentifier);
  if (!identifier) return null;

  const lookupOpts = { includePassword: true, activeOnly: true };

  if (identifier.includes('@')) {
    const byEmail = await accountRepository.findByEmail(identifier, lookupOpts);
    if (byEmail) return byEmail;
  }

  let account = await accountRepository.findByUsername(identifier, lookupOpts);
  if (account) return account;

  const user = await userRepository.findActiveByUsername(identifier);
  if (user?.accountId) {
    account = await accountRepository.findById(user.accountId, lookupOpts);
    if (account) {
      return backfillAccountUsername(account, user.username || identifier);
    }
  }

  account = await accountRepository.findByEmailLocalPart(identifier, lookupOpts);
  if (account) {
    return backfillAccountUsername(account, identifier);
  }

  return null;
}

async function login(payload, req) {
  const identifier = String(
    payload.identifier || payload.email || payload.username || ''
  ).trim();

  if (!identifier) {
    throw new AppError('Email or username is required', {
      status: 400,
      code: authErrorCodes.AUTH_INVALID_CREDENTIALS,
    });
  }

  const account = await resolveAccountForLogin(identifier);

  if (!account) {
    throw new AppError('Invalid email, username or password', {
      status: 401,
      code: authErrorCodes.AUTH_INVALID_CREDENTIALS,
    });
  }

  assertAccountCanAuthenticate(account);

  const validPassword = await passwordService.verifyPassword(payload.password, account.passwordHash);
  if (!validPassword) {
    throw new AppError('Invalid email, username or password', {
      status: 401,
      code: authErrorCodes.AUTH_INVALID_CREDENTIALS,
    });
  }

  return issueSession(account, req);
}

async function refresh(rawRefreshToken, req) {
  if (!rawRefreshToken) {
    throw new AppError('Refresh token is required', {
      status: 401,
      code: authErrorCodes.AUTH_TOKEN_INVALID,
    });
  }

  const tokenHash = tokenService.hashToken(rawRefreshToken);
  const stored = await refreshTokenRepository.findByTokenHash(tokenHash);

  if (!stored) {
    throw new AppError('Invalid refresh token', {
      status: 401,
      code: authErrorCodes.AUTH_TOKEN_INVALID,
    });
  }

  if (stored.revokedAt) {
    // A revoked refresh token presented again usually means token theft — revoke the whole family.
    await refreshTokenRepository.revokeFamily(stored.familyId, 'reuse_detected');
    throw new AppError('Refresh token reuse detected', {
      status: 401,
      code: authErrorCodes.AUTH_REFRESH_TOKEN_REUSED,
    });
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw new AppError('Refresh token expired', {
      status: 401,
      code: authErrorCodes.AUTH_TOKEN_EXPIRED,
    });
  }

  const account = await accountRepository.findById(stored.accountId);
  assertAccountCanAuthenticate(account);

  const sessionAccess = await getSessionAccessForAccount(account._id);
  const accessToken = tokenService.signAccessToken(account, sessionAccess.roles);
  const nextRefresh = tokenService.generateRefreshToken();
  nextRefresh.familyId = stored.familyId;

  const meta = requestMeta(req);
  const newRefreshDoc = await refreshTokenRepository.createRefreshToken({
    accountId: account._id,
    tokenHash: nextRefresh.hash,
    familyId: stored.familyId,
    expiresAt: tokenService.refreshTokenExpiresAt(),
    createdByIp: meta.createdByIp,
    userAgent: meta.userAgent,
  });

  await refreshTokenRepository.markReplaced(stored._id, newRefreshDoc._id);

  const isClientAccount = account.accountType === 'client';
  const user = isClientAccount ? null : await getUserSummaryForAccount(account._id);
  const { clientContact, client } = isClientAccount
    ? await getClientSessionForAccount(account)
    : { clientContact: null, client: null };

  return toAuthSessionDto({
    account,
    accessToken,
    refreshToken: nextRefresh.raw,
    expiresIn: tokenService.getAccessTokenExpiresInSeconds(),
    roles: sessionAccess.roles,
    permissions: sessionAccess.permissions,
    modules: sessionAccess.modules,
    user,
    clientContact,
    client,
  });
}

async function logout(rawRefreshToken) {
  if (!rawRefreshToken) {
    return { logged_out: true };
  }

  const tokenHash = tokenService.hashToken(rawRefreshToken);
  const stored = await refreshTokenRepository.findByTokenHash(tokenHash);

  if (stored && !stored.revokedAt) {
    await refreshTokenRepository.revokeById(stored._id, 'logout');
  }

  return { logged_out: true };
}

async function getMe(accountId) {
  const account = await accountRepository.findById(accountId, { activeOnly: true });
  assertAccountCanAuthenticate(account);

  const sessionAccess = await getSessionAccessForAccount(accountId);
  const isClientAccount = account.accountType === 'client';
  const user = isClientAccount ? null : await getUserSummaryForAccount(accountId);
  const { clientContact, client } = isClientAccount
    ? await getClientSessionForAccount(account)
    : { clientContact: null, client: null };

  return {
    account: toAccountDto(account),
    user,
    client_contact: clientContact,
    client,
    roles: sessionAccess.roles,
    permissions: sessionAccess.permissions,
    modules: sessionAccess.modules,
  };
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  assertAccountCanAuthenticate,
};
