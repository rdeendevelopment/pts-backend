const { ensureAccountIndexes } = require('./account.model');
const { ensureRefreshTokenIndexes } = require('./refreshToken.model');

async function ensureAuthIndexes() {
  await Promise.all([ensureAccountIndexes(), ensureRefreshTokenIndexes()]);
}

module.exports = {
  ensureAuthIndexes,
};
