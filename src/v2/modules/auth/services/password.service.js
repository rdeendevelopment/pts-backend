const bcrypt = require('bcryptjs');
const authConfig = require('../constants/auth.constants');

async function hashPassword(plainPassword) {
  return bcrypt.hash(String(plainPassword), authConfig.bcryptRounds);
}

async function verifyPassword(plainPassword, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(String(plainPassword), passwordHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
