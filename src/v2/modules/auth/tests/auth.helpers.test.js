const test = require('node:test');
const assert = require('node:assert/strict');
const passwordService = require('../services/password.service');
const tokenService = require('../services/token.service');
const authErrorCodes = require('../errors/authErrorCodes');

test('hashPassword and verifyPassword round-trip', async () => {
  const hash = await passwordService.hashPassword('SecretPass123');
  assert.notEqual(hash, 'SecretPass123');
  assert.equal(await passwordService.verifyPassword('SecretPass123', hash), true);
  assert.equal(await passwordService.verifyPassword('wrong', hash), false);
});

test('hashToken is deterministic', () => {
  const first = tokenService.hashToken('sample-token');
  const second = tokenService.hashToken('sample-token');
  assert.equal(first, second);
  assert.notEqual(first, 'sample-token');
});

test('generateRefreshToken returns raw token and hash', () => {
  const token = tokenService.generateRefreshToken();
  assert.ok(token.raw);
  assert.ok(token.hash);
  assert.ok(token.familyId);
  assert.equal(token.hash, tokenService.hashToken(token.raw));
});

test('getAccessTokenExpiresInSeconds parses minutes', () => {
  assert.equal(tokenService.getAccessTokenExpiresInSeconds(), 900);
});

test('auth error codes are defined', () => {
  assert.equal(authErrorCodes.AUTH_INVALID_CREDENTIALS, 'AUTH_INVALID_CREDENTIALS');
  assert.equal(authErrorCodes.AUTH_REFRESH_TOKEN_REUSED, 'AUTH_REFRESH_TOKEN_REUSED');
  assert.equal(authErrorCodes.AUTH_REGISTRATION_DISABLED, 'AUTH_REGISTRATION_DISABLED');
});
