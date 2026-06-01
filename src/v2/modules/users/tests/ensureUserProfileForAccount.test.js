const { test } = require('node:test');
const assert = require('node:assert/strict');

test('ensureUserProfileForAccount returns existing user by accountId', async () => {
  const accountId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';
  const existing = { _id: userId, accountId, email: 'a@example.com' };

  const userRepoPath = require.resolve('../repositories/user.repository');
  const accountRepoPath = require.resolve('../../auth/repositories/account.repository');
  const servicePath = require.resolve('../services/user.service');

  const savedUserRepo = require.cache[userRepoPath];
  const savedAccountRepo = require.cache[accountRepoPath];
  const savedService = require.cache[servicePath];

  delete require.cache[servicePath];

  require.cache[userRepoPath] = {
    id: userRepoPath,
    filename: userRepoPath,
    loaded: true,
    exports: {
      findByAccountId: async (id) => (String(id) === accountId ? existing : null),
      findByEmail: async () => null,
      createUser: async () => {
        throw new Error('should not create');
      },
      updateUser: async () => null,
    },
  };

  require.cache[accountRepoPath] = {
    id: accountRepoPath,
    filename: accountRepoPath,
    loaded: true,
    exports: {
      findById: async () => ({ _id: accountId, email: 'a@example.com', status: 'active' }),
    },
  };

  const { ensureUserProfileForAccount } = require('../services/user.service');
  const user = await ensureUserProfileForAccount(accountId);
  assert.equal(String(user._id), userId);

  if (savedService) require.cache[servicePath] = savedService;
  else delete require.cache[servicePath];
  if (savedUserRepo) require.cache[userRepoPath] = savedUserRepo;
  if (savedAccountRepo) require.cache[accountRepoPath] = savedAccountRepo;
});

test('ensureUserProfileForAccount creates user with email-based names when account names are empty', async () => {
  const accountId = '507f1f77bcf86cd799439011';
  const account = {
    _id: accountId,
    email: 'admin@pts.local',
    firstName: '',
    lastName: '',
    status: 'active',
  };

  const userRepoPath = require.resolve('../repositories/user.repository');
  const accountRepoPath = require.resolve('../../auth/repositories/account.repository');
  const servicePath = require.resolve('../services/user.service');

  const savedUserRepo = require.cache[userRepoPath];
  const savedAccountRepo = require.cache[accountRepoPath];
  const savedService = require.cache[servicePath];

  delete require.cache[servicePath];

  let createdPayload = null;

  require.cache[userRepoPath] = {
    id: userRepoPath,
    filename: userRepoPath,
    loaded: true,
    exports: {
      findByAccountId: async () => null,
      findByEmail: async () => null,
      createUser: async (payload) => {
        createdPayload = payload;
        return { _id: '507f1f77bcf86cd799439012', ...payload };
      },
      updateUser: async () => null,
    },
  };

  require.cache[accountRepoPath] = {
    id: accountRepoPath,
    filename: accountRepoPath,
    loaded: true,
    exports: {
      findById: async () => account,
    },
  };

  const { ensureUserProfileForAccount } = require('../services/user.service');
  const user = await ensureUserProfileForAccount(accountId);

  assert.equal(createdPayload.firstName, 'admin');
  assert.equal(createdPayload.lastName, 'User');
  assert.equal(createdPayload.displayName, 'admin User');
  assert.equal(createdPayload.email, 'admin@pts.local');
  assert.equal(String(user._id), '507f1f77bcf86cd799439012');

  if (savedService) require.cache[servicePath] = savedService;
  else delete require.cache[servicePath];
  if (savedUserRepo) require.cache[userRepoPath] = savedUserRepo;
  if (savedAccountRepo) require.cache[accountRepoPath] = savedAccountRepo;
});
