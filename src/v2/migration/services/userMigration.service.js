const { Types } = require('mongoose');
const accountRepository = require('../../modules/auth/repositories/account.repository');
const userRepository = require('../../modules/users/repositories/user.repository');
const roleRepository = require('../../modules/rbac/repositories/role.repository');
const accountRoleRepository = require('../../modules/rbac/repositories/accountRole.repository');
const { getAccountModel } = require('../../modules/auth/models/account.model');
const { getUserModel } = require('../../modules/users/models/user.model');
const { getAccountRoleModel } = require('../../modules/rbac/models/accountRole.model');
const { connectSourceDb, connectTargetForSeed } = require('../helpers/dualConnection.helper');
const { ensureMigrationIndexes } = require('../models');
const { writeMigrationReport } = require('../helpers/reportWriter.helper');
const legacyUserRepository = require('../repositories/legacyUser.repository');
const migrationErrorRepository = require('../repositories/migrationError.repository');
const {
  createMigrationRun,
  completeMigrationRun,
} = require('./migrationRun.service');
const {
  findExistingAccountMap,
  saveAccountMap,
  saveUserMap,
} = require('./mapLookup.service');
const {
  TRANSFORM_VERSION,
  normalizeEmail,
  normalizeLegacySourceRow,
  groupSourceRowsByEmail,
  buildMergedAccountPayload,
  buildUserProfilePayload,
  resolvePasswordMigration,
  mapAccountTypeToRoleKey,
  buildSourceHash,
} = require('../transformers/user.transformer');

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function createEmptyStats() {
  return {
    sourceCount: 0,
    targetAccountCount: 0,
    targetUserCount: 0,
    mappedCount: 0,
    mergedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    duplicateEmailCount: 0,
    forcedResetCount: 0,
    migratedPasswordCount: 0,
    missingEmailCount: 0,
    roleAssignmentCount: 0,
    orphanUserProfiles: 0,
    accountWithoutRole: 0,
  };
}

async function countTargetEntities() {
  const Account = getAccountModel();
  const User = getUserModel();
  const AccountRole = getAccountRoleModel();

  const [targetAccountCount, targetUserCount] = await Promise.all([
    Account.countDocuments({ isDeleted: false }),
    User.countDocuments({ isDeleted: false }),
  ]);

  const accountsWithoutRole = await Account.aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: 'pts_account_roles',
        localField: '_id',
        foreignField: 'accountId',
        as: 'roles',
      },
    },
    {
      $match: {
        roles: {
          $not: {
            $elemMatch: { isDeleted: false, status: 'active' },
          },
        },
      },
    },
    { $count: 'count' },
  ]);

  const orphanUsers = await User.aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: 'pts_accounts',
        localField: 'accountId',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $match: { account: { $size: 0 } } },
    { $count: 'count' },
  ]);

  return {
    targetAccountCount,
    targetUserCount,
    accountWithoutRole: accountsWithoutRole[0]?.count || 0,
    orphanUserProfiles: orphanUsers[0]?.count || 0,
  };
}

async function assignRoleIfMissing(accountId, accountType, { dryRun, stats, roleCache }) {
  const roleKey = mapAccountTypeToRoleKey(accountType);
  let role = roleCache.get(roleKey);
  if (!role) {
    role = await roleRepository.findByKey(roleKey);
    if (!role) {
      throw new Error(`Missing v2 role "${roleKey}". Run v2:seed first.`);
    }
    roleCache.set(roleKey, role);
  }

  const existing = await accountRoleRepository.findByAccountAndRole(accountId, role._id);
  if (existing) return false;

  if (!dryRun) {
    await accountRoleRepository.createAccountRole({
      accountId,
      roleId: role._id,
      assignedBy: null,
      assignedAt: new Date(),
      status: 'active',
    });
  }

  stats.roleAssignmentCount += 1;
  return true;
}

async function upsertMigratedAccount(merged, passwordResult, { dryRun }) {
  const accountPayload = {
    email: merged.email,
    passwordHash: passwordResult.passwordHash,
    firstName: merged.firstName,
    lastName: merged.lastName,
    status: merged.status,
    accountType: merged.accountType,
    lastLoginAt: merged.lastLoginAt,
    security: {
      passwordResetRequired: passwordResult.passwordResetRequired,
      passwordMigrated: passwordResult.passwordMigrated,
    },
    isDeleted: false,
    deletedAt: null,
  };

  if (dryRun) {
    const existing = await accountRepository.findByEmail(merged.email);
    return existing || { _id: new Types.ObjectId(), ...accountPayload };
  }

  let account = await accountRepository.findByEmail(merged.email);
  if (!account) {
    account = await accountRepository.createAccount(accountPayload);
    return account;
  }

  account = await accountRepository.updateAccount(account._id, accountPayload);
  return account;
}

async function upsertMigratedUser(accountId, merged, primaryRow, { dryRun }) {
  const userPayload = buildUserProfilePayload(accountId, merged, primaryRow);

  if (dryRun) {
    const existing = await userRepository.findByAccountId(accountId);
    return existing || { _id: new Types.ObjectId(), ...userPayload };
  }

  let user = await userRepository.findByAccountId(accountId);
  if (!user) {
    user = await userRepository.createUser(userPayload);
    return user;
  }

  user = await userRepository.updateUser(user._id, userPayload);
  return user;
}

async function recordMigrationError(targetConnection, {
  runId,
  sourceRow,
  code,
  message,
  dryRun,
}) {
  if (dryRun) return null;

  return migrationErrorRepository.createError(targetConnection, {
    runId,
    entityType: 'account',
    oldCollection: sourceRow.sourceCollection,
    oldId: sourceRow.legacyId,
    oldObjectId: sourceRow.oldObjectId,
    status: 'error',
    error: {
      code,
      message,
      details: {
        sourceHash: buildSourceHash(sourceRow),
        transformVersion: TRANSFORM_VERSION,
      },
    },
    sourceSnapshot: {
      email: sourceRow.email,
      legacyId: sourceRow.legacyId,
      sourceCollection: sourceRow.sourceCollection,
    },
  });
}

async function processEmailGroup({
  emailKey,
  group,
  runId,
  targetConnection,
  mode,
  stats,
  roleCache,
}) {
  const dryRun = mode === 'dry-run';
  const resume = mode === 'resume';

  if (group.missingEmail) {
    for (const row of group.rows) {
      stats.missingEmailCount += 1;
      stats.errorCount += 1;
      await recordMigrationError(targetConnection, {
        runId,
        sourceRow: row,
        code: 'USER_EMAIL_MISSING',
        message: 'Legacy source row is missing a usable email address.',
        dryRun,
      });
    }
    return;
  }

  if (group.rows.length > 1) {
    stats.duplicateEmailCount += 1;
  }

  if (resume) {
    const allMapped = await Promise.all(group.rows.map((row) => findExistingAccountMap(targetConnection, row)));
    if (allMapped.every(Boolean)) {
      stats.skippedCount += group.rows.length;
      return;
    }
  }

  const mergedResult = buildMergedAccountPayload(group.rows);
  if (mergedResult.error) {
    for (const row of group.rows) {
      stats.errorCount += 1;
      await recordMigrationError(targetConnection, {
        runId,
        sourceRow: row,
        code: mergedResult.error.code,
        message: mergedResult.error.message,
        dryRun,
      });
    }
    return;
  }

  const merged = mergedResult;
  const passwordResult = await resolvePasswordMigration(merged.primary.password, {
    mustChangePassword: merged.mustChangePassword,
  });

  if (passwordResult.forcedReset) stats.forcedResetCount += 1;
  else if (passwordResult.passwordMigrated) stats.migratedPasswordCount += 1;

  const account = await upsertMigratedAccount(merged, passwordResult, { dryRun });
  const user = await upsertMigratedUser(account._id, merged, merged.primary, { dryRun });
  await assignRoleIfMissing(account._id, merged.accountType, { dryRun, stats, roleCache });

  const mapStatusForRow = (rowIndex) => (
    group.rows.length > 1 && rowIndex > 0 ? 'merged' : 'mapped'
  );

  for (let index = 0; index < group.rows.length; index += 1) {
    const row = group.rows[index];
    const status = mapStatusForRow(index);
    const metadata = {
      sourceHash: buildSourceHash(row),
      transformVersion: TRANSFORM_VERSION,
      mergedIntoEmail: merged.email,
      accountType: merged.accountType,
    };

    if (status === 'merged') stats.mergedCount += 1;
    else stats.mappedCount += 1;

    if (!dryRun) {
      await saveAccountMap(targetConnection, {
        runId,
        sourceRow: row,
        newObjectId: account._id,
        status,
        metadata,
      });
      await saveUserMap(targetConnection, {
        runId,
        sourceRow: row,
        newObjectId: user._id,
        status,
        metadata,
      });
    }
  }
}

async function migrateUsers({
  mode = 'dry-run',
  batchSize = 500,
  startedBy = 'migrateUsers',
  notes = null,
  runId = null,
  skipRunComplete = false,
} = {}) {
  if (!['dry-run', 'live', 'resume'].includes(mode)) {
    throw new Error(`Unsupported migration mode "${mode}". Use dry-run, live, or resume.`);
  }

  const targetConnection = await connectTargetForSeed();
  const sourceConnection = await connectSourceDb();
  await ensureMigrationIndexes(targetConnection);

  const stats = createEmptyStats();
  const roleCache = new Map();
  const dryRun = mode === 'dry-run';

  const run = dryRun
    ? { _id: runId ? new Types.ObjectId(String(runId)) : new Types.ObjectId() }
    : runId
      ? { _id: new Types.ObjectId(String(runId)) }
      : await createMigrationRun(targetConnection, {
        mode,
        startedBy,
        notes: notes || `Users migration (${mode})`,
        options: { batchSize },
      });

  const { roleNameById, users, admins } = await legacyUserRepository.loadAllLegacyAuthRows(sourceConnection);
  stats.sourceCount = users.length + admins.length;

  const sourceRows = [
    ...users.map((doc) => normalizeLegacySourceRow(doc, 'users', roleNameById)),
    ...admins.map((doc) => normalizeLegacySourceRow(doc, 'account_admins', roleNameById)),
  ];

  const grouped = groupSourceRowsByEmail(sourceRows);
  const emailGroups = Array.from(grouped.entries()).map(([emailKey, group]) => ({
    emailKey,
    group,
  }));

  for (const batch of chunkArray(emailGroups, batchSize)) {
    for (const { group } of batch) {
      await processEmailGroup({
        emailKey: group.email,
        group,
        runId: run._id,
        targetConnection,
        mode,
        stats,
        roleCache,
      });
    }
  }

  const targetCounts = await countTargetEntities();
  stats.targetAccountCount = targetCounts.targetAccountCount;
  stats.targetUserCount = targetCounts.targetUserCount;
  stats.accountWithoutRole = targetCounts.accountWithoutRole;
  stats.orphanUserProfiles = targetCounts.orphanUserProfiles;

  const report = {
    runId: String(run._id),
    mode,
    batchSize,
    transformVersion: TRANSFORM_VERSION,
    completedAt: new Date().toISOString(),
    ...stats,
  };

  const reportPath = await writeMigrationReport(run._id, 'users', report);

  if (!dryRun && !skipRunComplete) {
    await completeMigrationRun(targetConnection, run._id, {
      status: stats.errorCount > 0 ? 'completed_with_errors' : 'completed',
      steps: [{
        entityType: 'users',
        status: stats.errorCount > 0 ? 'completed_with_errors' : 'completed',
        startedAt: run.startedAt || new Date(),
        finishedAt: new Date(),
        sourceCount: stats.sourceCount,
        insertedCount: stats.mappedCount,
        skippedCount: stats.skippedCount,
        errorCount: stats.errorCount,
        metadata: {
          mergedCount: stats.mergedCount,
          duplicateEmailCount: stats.duplicateEmailCount,
          forcedResetCount: stats.forcedResetCount,
          migratedPasswordCount: stats.migratedPasswordCount,
        },
      }],
    });
  }

  return {
    ok: true,
    mode,
    runId: String(run._id),
    reportPath,
    stats,
  };
}

module.exports = {
  migrateUsers,
  createEmptyStats,
};
