const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const authConfig = require('../../auth/constants/auth.constants');
const tokenService = require('../../auth/services/token.service');
const { GUEST_SESSION_TTL } = require('../constants/discussFlow.constants');

const GUEST_TOKEN_TYPE = 'discuss_flow_guest';

function generateGuestLinkToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashGuestLinkToken(rawToken) {
  return tokenService.hashToken(rawToken);
}

function signGuestSession(session) {
  const payload = {
    sub: session.sessionId,
    type: GUEST_TOKEN_TYPE,
    guestLinkId: String(session.guestLinkId),
    tenantId: String(session.tenantId),
    workspaceId: String(session.workspaceId),
    topicId: String(session.topicId),
    role: session.role,
    permissions: session.permissions || {},
    name: session.name || null,
    email: session.email || null,
  };

  return jwt.sign(payload, authConfig.jwtSecret, {
    expiresIn: GUEST_SESSION_TTL,
  });
}

function verifyGuestSession(token) {
  const payload = jwt.verify(token, authConfig.jwtSecret);
  if (payload.type !== GUEST_TOKEN_TYPE || !payload.sub || !payload.topicId) {
    throw new Error('Invalid guest session token');
  }
  return payload;
}

module.exports = {
  GUEST_TOKEN_TYPE,
  generateGuestLinkToken,
  hashGuestLinkToken,
  signGuestSession,
  verifyGuestSession,
};
