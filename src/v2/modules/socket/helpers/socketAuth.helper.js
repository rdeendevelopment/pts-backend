const accountRepository = require('../../auth/repositories/account.repository');
const tokenService = require('../../auth/services/token.service');
const userRepository = require('../../users/repositories/user.repository');
const socketErrorCodes = require('../errors/socketErrorCodes');

function createSocketAuthError(message, code) {
  const err = new Error(message);
  err.data = { code };
  return err;
}

function extractTokenFromHandshake(handshake) {
  const authToken = handshake?.auth?.token;
  if (authToken && String(authToken).trim()) {
    return String(authToken).trim();
  }

  const queryToken = handshake?.query?.token;
  if (queryToken && String(queryToken).trim()) {
    return String(queryToken).trim();
  }

  const header = handshake?.headers?.authorization || handshake?.headers?.Authorization;
  if (header && typeof header === 'string') {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

async function authenticateSocketHandshake(handshake) {
  const token = extractTokenFromHandshake(handshake);
  if (!token) {
    throw createSocketAuthError('Socket authentication required', socketErrorCodes.SOCKET_AUTH_REQUIRED);
  }

  let payload;
  try {
    payload = tokenService.verifyAccessToken(token);
  } catch (_err) {
    throw createSocketAuthError('Invalid socket access token', socketErrorCodes.SOCKET_AUTH_INVALID);
  }

  if (payload.type !== 'access' || !payload.sub) {
    throw createSocketAuthError('Invalid socket access token', socketErrorCodes.SOCKET_AUTH_INVALID);
  }

  const account = await accountRepository.findById(payload.sub);
  if (!account || account.isDeleted) {
    throw createSocketAuthError('Invalid socket access token', socketErrorCodes.SOCKET_AUTH_INVALID);
  }

  if (account.status !== 'active') {
    throw createSocketAuthError('Account is not active', socketErrorCodes.SOCKET_ACCOUNT_INACTIVE);
  }

  let user = await userRepository.findByAccountId(account._id);
  if (!user) {
    try {
      const { ensureUserProfileForAccount } = require('../../users/services/user.service');
      user = await ensureUserProfileForAccount(account._id);
    } catch (_err) {
      user = null;
    }
  }

  const accountId = String(account._id);
  const displayName = user?.displayName
    || [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    || account.firstName && account.lastName
      ? `${account.firstName} ${account.lastName}`.trim()
      : account.email;

  return {
    accountId,
    account,
    userId: user ? String(user._id) : null,
    user: user || null,
    accountType: account.accountType,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    displayName,
  };
}

module.exports = {
  extractTokenFromHandshake,
  authenticateSocketHandshake,
  createSocketAuthError,
};
