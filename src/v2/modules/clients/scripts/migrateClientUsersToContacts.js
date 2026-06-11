const { connectMongo, mongoose } = require('../../../../../config/mongo');
const { connectV2Database, closeV2Database } = require('../../../database/connection');
const accountRepository = require('../../auth/repositories/account.repository');
const userRepository = require('../../users/repositories/user.repository');
const clientContactRepository = require('../repositories/clientContact.repository');

function hasFlag(name) {
  return process.argv.includes(name);
}

async function migrateClientUsersToContacts({ dryRun = true } = {}) {
  await connectMongo();
  await connectV2Database();

  const clientAccounts = await accountRepository.findAllByAccountType('client', { activeOnly: false });
  const report = {
    dryRun,
    clientAccounts: clientAccounts.length,
    contactsCreated: 0,
    usersSoftDeleted: 0,
    skipped: 0,
    issues: [],
  };

  for (const account of clientAccounts) {
    if (!account.clientId) {
      report.skipped += 1;
      report.issues.push({
        accountId: String(account._id),
        reason: 'client account has no clientId',
      });
      continue;
    }

    const existingContact = await clientContactRepository.findByAccountId(account._id);
    const user = await userRepository.findByAccountId(account._id);

    if (!existingContact) {
      const firstName = user?.firstName || account.firstName || 'Client';
      const lastName = user?.lastName || account.lastName || 'Contact';
      const displayName = user?.displayName || `${firstName} ${lastName}`.trim();

      if (!dryRun) {
        await clientContactRepository.createContact({
          accountId: account._id,
          clientId: account.clientId,
          firstName,
          lastName,
          displayName,
          email: user?.email || account.email || null,
          phone: user?.phone || null,
          jobTitle: user?.jobTitle || null,
          status: account.status || user?.status || 'active',
          inviteStatus: 'accepted',
          isPrimaryContact: false,
          notes: user?.notes || null,
          createdBy: account._id,
          updatedBy: account._id,
        });
      }
      report.contactsCreated += 1;
    }

    if (user) {
      if (!dryRun) {
        await userRepository.softDeleteUser(user._id);
      }
      report.usersSoftDeleted += 1;
    } else {
      report.skipped += 1;
    }
  }

  return report;
}

async function main() {
  const dryRun = !hasFlag('--live');
  const report = await migrateClientUsersToContacts({ dryRun });
  console.log(JSON.stringify(report, null, 2));
  await closeV2Database();
  await mongoose.connection.close();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err);
    try {
      await closeV2Database();
      await mongoose.connection.close();
    } catch (_) {
      // ignore close failures
    }
    process.exit(1);
  });
}

module.exports = {
  migrateClientUsersToContacts,
};
