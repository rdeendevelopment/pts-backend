/**
 * Reactivate a deactivated v2 account + user profile by email.
 *
 * Usage:
 *   node scripts/reactivate-v2-account.js admin@pts.com
 */
require('dotenv').config();

const { connectTargetForSeed } = require('../src/v2/migration/helpers/dualConnection.helper');
const accountRepository = require('../src/v2/modules/auth/repositories/account.repository');
const userRepository = require('../src/v2/modules/users/repositories/user.repository');
const rbacAccessService = require('../src/v2/modules/rbac/services/rbacAccess.service');

async function main() {
  const email = String(process.argv[2] || '').toLowerCase().trim();
  if (!email) {
    console.error('Usage: node scripts/reactivate-v2-account.js <email>');
    process.exit(1);
  }

  await connectTargetForSeed();

  const account = await accountRepository.findByEmail(email);
  if (!account) {
    console.error(`No account found for ${email}`);
    process.exit(1);
  }

  await accountRepository.updateAccount(account._id, {
    status: 'active',
    isDeleted: false,
    deletedAt: null,
  });

  const user = await userRepository.findByAccountId(account._id);
  if (user) {
    await userRepository.updateUser(user._id, {
      status: 'active',
      isDeleted: false,
      deletedAt: null,
    });
  }

  const roleAssigned = await rbacAccessService.ensureDefaultRoleAssignment(account._id);
  rbacAccessService.clearSessionAccessCache(account._id);

  console.log(`Reactivated account ${email}${user ? ' and linked user profile' : ''}.`);
  if (roleAssigned) {
    console.log(`Assigned default RBAC role for accountType "${account.accountType}".`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
