const { AppError } = require('../../../kernel/errors');
const authErrorCodes = require('../errors/authErrorCodes');
const accountRepository = require('../repositories/account.repository');
const passwordService = require('../services/password.service');

async function verifyAccountPasswordOrThrow(accountId, password) {
  const plain = String(password || '').trim();
  if (!plain) {
    throw new AppError('Password confirmation is required', {
      status: 400,
      code: authErrorCodes.AUTH_INVALID_CREDENTIALS,
    });
  }

  const account = await accountRepository.findById(accountId, { includePassword: true });
  if (!account?.passwordHash) {
    throw new AppError('Account not found', {
      status: 404,
      code: authErrorCodes.AUTH_UNAUTHORIZED,
    });
  }

  const valid = await passwordService.verifyPassword(plain, account.passwordHash);
  if (!valid) {
    throw new AppError('Invalid password', {
      status: 401,
      code: authErrorCodes.AUTH_INVALID_CREDENTIALS,
    });
  }

  return true;
}

module.exports = {
  verifyAccountPasswordOrThrow,
};
