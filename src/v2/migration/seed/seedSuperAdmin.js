const { info } = require('../../kernel/logger');
const accountRepository = require('../../modules/auth/repositories/account.repository');
const passwordService = require('../../modules/auth/services/password.service');
const userRepository = require('../../modules/users/repositories/user.repository');
const roleRepository = require('../../modules/rbac/repositories/role.repository');
const accountRoleRepository = require('../../modules/rbac/repositories/accountRole.repository');
const { connectTargetForSeed } = require('../helpers/dualConnection.helper');

function getSeedAdminConfig() {
  return {
    email: String(process.env.PTS_V2_SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase().trim(),
    password: process.env.PTS_V2_SEED_ADMIN_PASSWORD || 'test1234',
    firstName: process.env.PTS_V2_SEED_ADMIN_FIRST_NAME || 'Super',
    lastName: process.env.PTS_V2_SEED_ADMIN_LAST_NAME || 'Admin',
  };
}

/**
 * Creates the first super_admin account + pts_users profile + role assignment.
 * Idempotent by email.
 */
async function seedSuperAdmin() {
  await connectTargetForSeed();

  const config = getSeedAdminConfig();
  const seedUsername = String(process.env.PTS_V2_SEED_ADMIN_USERNAME || '')
    .toLowerCase()
    .trim()
    || (config.email.includes('@') ? config.email.split('@')[0] : 'admin');
  const summary = {
    account: { created: false, updated: false, email: config.email },
    user: { created: false, updated: false },
    role: { assigned: false },
  };

  let account = await accountRepository.findByEmail(config.email);
  if (!account) {
    const passwordHash = await passwordService.hashPassword(config.password);
    account = await accountRepository.createAccount({
      username: seedUsername,
      email: config.email,
      passwordHash,
      firstName: config.firstName,
      lastName: config.lastName,
      accountType: 'super_admin',
      status: 'active',
    });
    summary.account.created = true;
  } else {
    const updates = {
      username: seedUsername,
      firstName: config.firstName,
      lastName: config.lastName,
      accountType: 'super_admin',
      status: 'active',
      isDeleted: false,
      deletedAt: null,
    };
    if (config.password) {
      updates.passwordHash = await passwordService.hashPassword(config.password);
    }
    await accountRepository.updateAccount(account._id, updates);
    summary.account.updated = true;
    account = await accountRepository.findById(account._id);
  }

  const displayName = `${config.firstName} ${config.lastName}`.trim();
  let user = await userRepository.findByAccountId(account._id);

  if (!user) {
    user = await userRepository.createUser({
      accountId: account._id,
      username: seedUsername,
      firstName: config.firstName,
      lastName: config.lastName,
      displayName,
      email: config.email,
      status: 'active',
    });
    summary.user.created = true;
  } else {
    await userRepository.updateUser(user._id, {
      username: seedUsername,
      firstName: config.firstName,
      lastName: config.lastName,
      displayName,
      email: config.email,
      status: 'active',
      isDeleted: false,
      deletedAt: null,
    });
    summary.user.updated = true;
  }

  const superAdminRole = await roleRepository.findByKey('super_admin');
  if (!superAdminRole) {
    throw new Error('super_admin role missing. Run seedCore first.');
  }

  const existingAssignment = await accountRoleRepository.findByAccountAndRole(
    account._id,
    superAdminRole._id
  );

  if (!existingAssignment) {
    await accountRoleRepository.createAccountRole({
      accountId: account._id,
      roleId: superAdminRole._id,
      assignedBy: null,
      assignedAt: new Date(),
      status: 'active',
    });
    summary.role.assigned = true;
  }

  info('PTS v2 migration seedSuperAdmin completed', summary);
  return summary;
}

module.exports = {
  seedSuperAdmin,
  getSeedAdminConfig,
};
