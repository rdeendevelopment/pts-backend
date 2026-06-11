const { AppError } = require('../../../kernel/errors');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const guestTokenService = require('../services/guestToken.service');

function readGuestBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
}

async function authenticateGuestSession(req, _res, next) {
  try {
    const token = readGuestBearerToken(req);
    if (!token) {
      throw new AppError('Guest authentication required', {
        status: 401,
        code: discussFlowErrorCodes.DISCUSS_FLOW_GUEST_AUTH_REQUIRED,
      });
    }

    let payload;
    try {
      payload = guestTokenService.verifyGuestSession(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AppError('Guest session expired', {
          status: 401,
          code: discussFlowErrorCodes.DISCUSS_FLOW_GUEST_SESSION_INVALID,
        });
      }
      throw new AppError('Invalid guest session', {
        status: 401,
        code: discussFlowErrorCodes.DISCUSS_FLOW_GUEST_SESSION_INVALID,
      });
    }

    req.dfGuestSession = {
      sessionId: payload.sub,
      guestLinkId: payload.guestLinkId,
      tenantId: payload.tenantId,
      workspaceId: payload.workspaceId,
      topicId: payload.topicId,
      role: payload.role,
      permissions: payload.permissions || {},
      name: payload.name || null,
      email: payload.email || null,
      tokenPayload: payload,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticateGuestSession;
