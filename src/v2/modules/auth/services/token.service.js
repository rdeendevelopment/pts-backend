const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const authConfig = require('../constants/auth.constants');

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function generateRefreshToken() {
  const raw = crypto.randomBytes(48).toString('hex');
  return {
    raw,
    hash: hashToken(raw),
    familyId: crypto.randomUUID(),
  };
}

function signAccessToken(account, roles = []) {
  const roleKeys = (Array.isArray(roles) ? roles : [])
    .map((role) => (typeof role === 'string' ? role : role?.key))
    .filter(Boolean);

  const payload = {
    sub: String(account._id),
    type: 'access',
    accountType: account.accountType,
    roles: roleKeys,
    user: {
      id: String(account._id),
      role: account.accountType,
      roles: roleKeys,
    },
  };

  return jwt.sign(payload, authConfig.jwtSecret, {
    expiresIn: authConfig.accessTokenTtl,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, authConfig.jwtSecret);
}

function getAccessTokenExpiresInSeconds() {
  const ttl = authConfig.accessTokenTtl;
  if (typeof ttl === 'number') return ttl;

  const match = String(ttl).match(/^(\d+)([smhd])$/i);
  if (!match) return 900;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] || 60);
}

function refreshTokenExpiresAt() {
  return new Date(Date.now() + authConfig.refreshTokenMs);
}

module.exports = {
  hashToken,
  generateRefreshToken,
  signAccessToken,
  verifyAccessToken,
  getAccessTokenExpiresInSeconds,
  refreshTokenExpiresAt,
};
