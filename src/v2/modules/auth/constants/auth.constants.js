const constants = require('../../../../../config/constants');
const env = require('../../../config/env');

const ACCOUNT_STATUSES = ['active', 'inactive', 'suspended', 'pending'];
const ACCOUNT_TYPES = ['super_admin', 'admin', 'manager', 'employee'];

const jwtSecret = process.env.PTS_V2_JWT_SECRET
  || constants.APP_SECRET
  || (env.isProduction ? '' : 'dev-only-v2-secret-change-me');
const accessTokenTtl = process.env.PTS_V2_ACCESS_TOKEN_TTL || '15m';
const refreshTokenDays = Number(process.env.PTS_V2_REFRESH_TOKEN_DAYS || 30);
const bcryptRounds = Number(process.env.PTS_V2_BCRYPT_ROUNDS || 12);

/**
 * Public /auth/register is convenient in local development.
 * In staging and production it stays off unless PTS_V2_ALLOW_PUBLIC_REGISTER=true.
 */
function resolveAllowPublicRegister() {
  const flag = process.env.PTS_V2_ALLOW_PUBLIC_REGISTER;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return env.isDevelopment;
}

if (env.isProduction && (!jwtSecret || jwtSecret.length < 16)) {
  throw new Error('PTS v2 auth requires PTS_V2_JWT_SECRET or APP_SECRET (min 16 chars) in production.');
}

module.exports = {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  jwtSecret,
  accessTokenTtl,
  refreshTokenDays,
  refreshTokenMs: refreshTokenDays * 24 * 60 * 60 * 1000,
  bcryptRounds,
  allowPublicRegister: resolveAllowPublicRegister(),
};
