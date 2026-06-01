const jwt = require('jsonwebtoken');
const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const authErrorCodes = require('../errors/authErrorCodes');
const accountRepository = require('../repositories/account.repository');
const authService = require('../services/auth.service');
const tokenService = require('../services/token.service');
const rbacAccessService = require('../../rbac/services/rbacAccess.service');

function readBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
}

async function authenticate(req, _res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      throw new AppError('Unauthorized', {
        status: 401,
        code: authErrorCodes.AUTH_UNAUTHORIZED,
      });
    }

    let payload;
    try {
      payload = tokenService.verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Access token expired', {
          status: 401,
          code: authErrorCodes.AUTH_TOKEN_EXPIRED,
        });
      }
      throw new AppError('Invalid access token', {
        status: 401,
        code: authErrorCodes.AUTH_TOKEN_INVALID,
      });
    }

    if (payload.type !== 'access' || !payload.sub) {
      throw new AppError('Invalid access token', {
        status: 401,
        code: authErrorCodes.AUTH_TOKEN_INVALID,
      });
    }

    const accountId = assertObjectId(payload.sub, 'accountId');
    const account = await accountRepository.findById(accountId, { activeOnly: true });
    authService.assertAccountCanAuthenticate(account);

    const sessionAccess = await rbacAccessService.getSessionAccessForAccount(accountId);

    req.v2Auth = {
      accountId: String(account._id),
      account,
      tokenPayload: payload,
      sessionAccess,
      permissions: sessionAccess.permissions,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticate;
