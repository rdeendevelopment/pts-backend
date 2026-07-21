const { Types } = require('mongoose');
const { connectTargetForSeed } = require('../../helpers/dualConnection.helper');
const { ensureMigrationIndexes } = require('../../models');
const migrationMapRepository = require('../../repositories/migrationMap.repository');
const migrationErrorRepository = require('../../repositories/migrationError.repository');
const { extractPhase1TablesFromSqlFile } = require('../parsers/sqlInsertStream.parser');
const {
  transformSqlUserRow,
  transformSqlAdminRow,
  transformSqlClientRow,
  transformSqlProjectRow,
  transformSqlAssignmentRow,
  transformSqlWorkCategoryRow,
} = require('../transformers/sqlRow.transformer');
const {
  resolvePasswordMigration,
  buildUserProfilePayload,
} = require('../../transformers/user.transformer');
const { mapSqlRoleKey } = require('../helpers/sqlEnumMaps.helper');
const { buildEmptyProjectStats } = require('../../transformers/project.transformer');
const { getSeedAdminConfig } = require('../../seed/seedSuperAdmin');
const accountRepository = require('../../../modules/auth/repositories/account.repository');
const userRepository = require('../../../modules/users/repositories/user.repository');
const roleRepository = require('../../../modules/rbac/repositories/role.repository');
const accountRoleRepository = require('../../../modules/rbac/repositories/accountRole.repository');
const clientRepository = require('../../../modules/clients/repositories/client.repository');
const projectRepository = require('../../../modules/projects/repositories/project.repository');
const projectBudgetRepository = require('../../../modules/projects/repositories/projectBudget.repository');
const projectAssignmentRepository = require('../../../modules/projects/repositories/projectAssignment.repository');
const workCategoryRepository = require('../../../modules/activity/repositories/workCategory.repository');
const { getProjectStatsModel } = require('../../../modules/projects/models/projectStats.model');
const { createSqlMigrationRun, completeSqlMigrationRun } = require('./sqlMigrationRun.service');
const { rollbackSqlPhase1Run } = require('./phase1Reset.service');
const { validateSqlPhase1Import } = require('./phase1Validation.service');
const { initPhase1Report, printPhase1Report } = require('../helpers/phase1Reporter.helper');

const TRANSFORM_VERSION = 'sql-phase1-1.0.0';

function mapCacheKey(entityType, oldCollection, oldId) {
  return `${entityType}:${oldCollection}:${oldId}`;
}

function createMapCache() {
  return new Map();
}

async function preloadMapCache(connection) {
  const cache = createMapCache();
  const maps = await connection.collection('pts_migration_maps').find({
    oldId: { $ne: null },
    status: { $in: ['mapped', 'merged', 'skipped'] },
  }).sort({ migratedAt: -1, createdAt: -1 }).toArray();

  for (const map of maps) {
    const key = mapCacheKey(map.entityType, map.oldCollection, map.oldId);
    if (!cache.has(key)) cache.set(key, map.newObjectId);
  }

  return cache;
}

async function recordError(connection, {
  runId,
  dryRun,
  entityType,
  oldCollection,
  oldId,
  code,
  message,
  rawData,
}) {
  if (dryRun || !runId) return;
  await migrationErrorRepository.createError(connection, {
    runId,
    entityType,
    oldCollection,
    oldId,
    status: 'error',
    error: { code, message, details: null },
    sourceSnapshot: rawData,
  });
}

async function saveMap(connection, {
  runId,
  dryRun,
  cache,
  entityType,
  oldCollection,
  oldId,
  newObjectId,
  status = 'mapped',
}) {
  const key = mapCacheKey(entityType, oldCollection, oldId);
  cache.set(key, newObjectId);

  if (dryRun || !runId) return;

  await migrationMapRepository.upsertMap(connection, {
    runId,
    entityType,
    oldCollection,
    oldId,
    oldObjectId: null,
    newObjectId,
    status,
    migratedAt: new Date(),
    metadata: { transformVersion: TRANSFORM_VERSION },
  });
}

function resolveCachedId(cache, entityType, oldCollection, oldId) {
  return cache.get(mapCacheKey(entityType, oldCollection, oldId)) || null;
}

async function assignRole(accountId, accountType, { dryRun, roleCache }) {
  const roleKey = mapSqlRoleKey(accountType);
  let role = roleCache.get(roleKey);
  if (!role) {
    role = await roleRepository.findByKey(roleKey);
    if (!role) throw new Error(`Missing v2 role "${roleKey}". Run npm run v2:seed first.`);
    roleCache.set(roleKey, role);
  }

  const existing = await accountRoleRepository.findByAccountAndRole(accountId, role._id);
  if (existing) return existing._id;

  if (!dryRun) {
    const accountRole = await accountRoleRepository.createAccountRole({
      accountId,
      roleId: role._id,
      assignedBy: null,
      assignedAt: new Date(),
      status: 'active',
    });
    return accountRole._id;
  }

  return new Types.ObjectId();
}

async function importSqlAccountUser({
  connection,
  run,
  cache,
  roleCache,
  row,
  oldCollection,
  entityStats,
  seenEmails,
  dryRun,
  skipIfSeedAdmin = false,
}) {
  const seedEmail = getSeedAdminConfig().email;

  if (!row.email) {
    entityStats.errors += 1;
    await recordError(connection, {
      runId: run._id,
      dryRun,
      entityType: oldCollection === 'admins' ? 'admin' : 'user',
      oldCollection,
      oldId: row.legacyId,
      code: 'EMAIL_MISSING',
      message: 'Row has no email',
      rawData: row,
    });
    return;
  }

  if (skipIfSeedAdmin && row.email === seedEmail) {
    entityStats.skipped += 1;
    await recordError(connection, {
      runId: run._id,
      dryRun,
      entityType: 'admin',
      oldCollection: 'admins',
      oldId: row.legacyId,
      code: 'SEED_ADMIN_SKIPPED',
      message: 'Skipped admin row matching seeded super admin email',
      rawData: { email: row.email },
    });
    return;
  }

  if (seenEmails.has(row.email)) {
    entityStats.skipped += 1;
    await recordError(connection, {
      runId: run._id,
      dryRun,
      entityType: oldCollection === 'admins' ? 'admin' : 'user',
      oldCollection,
      oldId: row.legacyId,
      code: 'DUPLICATE_EMAIL',
      message: `Duplicate email in SQL import: ${row.email}`,
      rawData: { email: row.email },
    });
    return;
  }

  const existingAccount = await accountRepository.findByEmail(row.email);
  if (existingAccount) {
    entityStats.skipped += 1;
    seenEmails.add(row.email);
    const existingUser = await userRepository.findByAccountId(existingAccount._id);
    await saveMap(connection, {
      runId: run._id,
      dryRun,
      cache,
      entityType: 'account',
      oldCollection,
      oldId: row.legacyId,
      newObjectId: existingAccount._id,
      status: 'merged',
    });
    if (existingUser) {
      await saveMap(connection, {
        runId: run._id,
        dryRun,
        cache,
        entityType: 'user',
        oldCollection,
        oldId: row.legacyId,
        newObjectId: existingUser._id,
        status: 'merged',
      });
    }
    return;
  }

  const passwordResult = await resolvePasswordMigration(row.password, {
    mustChangePassword: row.mustChangePassword,
  });

  const accountPayload = {
    email: row.email,
    username: row.username || (row.email.includes('@') ? row.email.split('@')[0] : `user_${row.legacyId}`),
    passwordHash: passwordResult.passwordHash,
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status,
    accountType: row.accountType,
    lastLoginAt: row.lastLoginAt,
    security: {
      passwordResetRequired: passwordResult.passwordResetRequired,
      passwordMigrated: passwordResult.passwordMigrated,
    },
    isDeleted: row.isDeleted,
    deletedAt: row.isDeleted ? row.updatedAt || new Date() : null,
  };

  let accountId;
  let userId;

  if (dryRun) {
    accountId = new Types.ObjectId();
    userId = new Types.ObjectId();
  } else {
    const account = await accountRepository.createAccount(accountPayload);
    accountId = account._id;

    const userPayload = {
      ...buildUserProfilePayload(accountId, {
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        status: row.status,
      }, {
        contact: row.phone,
        imageUrl: row.imageUrl,
        createdAt: row.createdAt,
      }),
      username: accountPayload.username,
    };

    if (row.createdAt) {
      userPayload.createdAt = row.createdAt;
      userPayload.updatedAt = row.updatedAt || row.createdAt;
    }

    const user = await userRepository.createUser(userPayload);
    userId = user._id;

    const accountRoleId = await assignRole(accountId, row.accountType, { dryRun, roleCache });
    await saveMap(connection, {
      runId: run._id,
      dryRun,
      cache,
      entityType: 'account_role',
      oldCollection,
      oldId: row.legacyId,
      newObjectId: accountRoleId,
      status: 'mapped',
    });
  }

  seenEmails.add(row.email);

  await saveMap(connection, {
    runId: run._id,
    dryRun,
    cache,
    entityType: 'account',
    oldCollection,
    oldId: row.legacyId,
    newObjectId: accountId,
  });

  await saveMap(connection, {
    runId: run._id,
    dryRun,
    cache,
    entityType: 'user',
    oldCollection,
    oldId: row.legacyId,
    newObjectId: userId,
  });

  entityStats.imported += 1;
}

/**
 * Phase 1 SQL → Mongo import.
 *
 * Extension point (Phase 2): working_hours → Activity V2 (timesheets, entries).
 * See docs/migration/SQL_PHASE1.md
 */
async function runSqlPhase1Migration(options = {}) {
  const started = Date.now();
  const filePath = options.file;
  const dryRun = options.dryRun !== false;
  const verbose = Boolean(options.verbose);

  if (!filePath) {
    throw new Error('--file is required');
  }

  const connection = await connectTargetForSeed();
  await ensureMigrationIndexes(connection);

  if (options.reset) {
    if (!options.runId) {
      throw new Error('--reset=true requires --runId=<previous-run-id>');
    }
    const rollback = await rollbackSqlPhase1Run(connection, options.runId);
    if (verbose) {
      // eslint-disable-next-line no-console
      console.log('[phase1] rollback complete', JSON.stringify(rollback, null, 2));
    }
  }

  const { data, stats: parseStats } = await extractPhase1TablesFromSqlFile(filePath, { verbose });
  const report = initPhase1Report({
    fileName: filePath.split('/').pop(),
    dryRun,
    parseStats,
  });

  const run = await createSqlMigrationRun(connection, {
    fileName: report.fileName,
    dryRun,
    notes: `SQL phase 1 import (${dryRun ? 'dry-run' : 'live'})`,
  });
  report.runId = run._id ? String(run._id) : null;

  const cache = await preloadMapCache(connection);
  const roleCache = new Map();
  const seenEmails = new Set();

  report.entities.users.expected = data.users.length;
  report.entities.admins.expected = data.admins.length;
  report.entities.clients.expected = data.clients.length;
  report.entities.projects.expected = data.projects.length;
  report.entities.assignments.expected = data.project_users.length;
  report.entities.workCategories.expected = data.project_default_tasks.length;

  for (const raw of data.users) {
    try {
      const row = transformSqlUserRow(raw);
      if (resolveCachedId(cache, 'user', 'users', row.legacyId)) {
        report.entities.users.skipped += 1;
        continue;
      }
      await importSqlAccountUser({
        connection,
        run,
        cache,
        roleCache,
        row,
        oldCollection: 'users',
        entityStats: report.entities.users,
        seenEmails,
        dryRun,
      });
    } catch (err) {
      report.entities.users.errors += 1;
      await recordError(connection, {
        runId: run._id,
        dryRun,
        entityType: 'user',
        oldCollection: 'users',
        oldId: Number(raw.id),
        code: 'USER_IMPORT_FAILED',
        message: err.message,
        rawData: raw,
      });
    }
  }

  for (const raw of data.admins) {
    try {
      const row = transformSqlAdminRow(raw);
      if (resolveCachedId(cache, 'user', 'admins', row.legacyId)) {
        report.entities.admins.skipped += 1;
        continue;
      }
      await importSqlAccountUser({
        connection,
        run,
        cache,
        roleCache,
        row,
        oldCollection: 'admins',
        entityStats: report.entities.admins,
        seenEmails,
        dryRun,
        skipIfSeedAdmin: true,
      });
    } catch (err) {
      report.entities.admins.errors += 1;
      await recordError(connection, {
        runId: run._id,
        dryRun,
        entityType: 'admin',
        oldCollection: 'admins',
        oldId: Number(raw.id),
        code: 'ADMIN_IMPORT_FAILED',
        message: err.message,
        rawData: raw,
      });
    }
  }

  for (const raw of data.clients) {
    try {
      const transformed = transformSqlClientRow(raw);
      if (transformed.error) {
        report.entities.clients.errors += 1;
        await recordError(connection, {
          runId: run._id,
          dryRun,
          entityType: 'client',
          oldCollection: 'clients',
          oldId: Number(raw.id),
          code: transformed.error.code,
          message: transformed.error.message,
          rawData: raw,
        });
        continue;
      }

      if (resolveCachedId(cache, 'client', 'clients', transformed.legacyId)) {
        report.entities.clients.skipped += 1;
        continue;
      }

      const existingClient = await clientRepository.findByNormalizedName(
        transformed.payload.normalizedName
      );
      if (existingClient) {
        await saveMap(connection, {
          runId: run._id, dryRun, cache,
          entityType: 'client', oldCollection: 'clients',
          oldId: transformed.legacyId, newObjectId: existingClient._id, status: 'merged',
        });
        report.entities.clients.skipped += 1;
        continue;
      }

      if (dryRun) {
        const fakeId = new Types.ObjectId();
        await saveMap(connection, {
          runId: run._id,
          dryRun,
          cache,
          entityType: 'client',
          oldCollection: 'clients',
          oldId: transformed.legacyId,
          newObjectId: fakeId,
        });
        report.entities.clients.imported += 1;
        continue;
      }

      const client = await clientRepository.createClient(transformed.payload);

      await saveMap(connection, {
        runId: run._id,
        dryRun,
        cache,
        entityType: 'client',
        oldCollection: 'clients',
        oldId: transformed.legacyId,
        newObjectId: client._id,
      });
      report.entities.clients.imported += 1;
    } catch (err) {
      report.entities.clients.errors += 1;
      await recordError(connection, {
        runId: run._id,
        dryRun,
        entityType: 'client',
        oldCollection: 'clients',
        oldId: Number(raw.id),
        code: 'CLIENT_IMPORT_FAILED',
        message: err.message,
        rawData: raw,
      });
    }
  }

  for (const raw of data.projects) {
    try {
      const transformed = transformSqlProjectRow(raw);
      if (transformed.error) {
        report.entities.projects.errors += 1;
        await recordError(connection, {
          runId: run._id,
          dryRun,
          entityType: 'project',
          oldCollection: 'projects',
          oldId: Number(raw.id),
          code: transformed.error.code,
          message: transformed.error.message,
          rawData: raw,
        });
        continue;
      }

      if (resolveCachedId(cache, 'project', 'projects', transformed.legacyId)) {
        report.entities.projects.skipped += 1;
        continue;
      }

      const clientId = transformed.legacyClientId
        ? resolveCachedId(cache, 'client', 'clients', transformed.legacyClientId)
        : null;

      if (!clientId) {
        report.entities.projects.skipped += 1;
        await recordError(connection, {
          runId: run._id,
          dryRun,
          entityType: 'project',
          oldCollection: 'projects',
          oldId: transformed.legacyId,
          code: 'ORPHAN_PROJECT',
          message: `Project references unknown client id ${transformed.legacyClientId}`,
          rawData: raw,
        });
        continue;
      }

      const payload = { ...transformed.payload, clientId };

      const existingProject = await projectRepository.findByClientAndNormalizedName(
        clientId,
        payload.normalizedName
      );
      if (existingProject) {
        await saveMap(connection, {
          runId: run._id, dryRun, cache,
          entityType: 'project', oldCollection: 'projects',
          oldId: transformed.legacyId, newObjectId: existingProject._id, status: 'merged',
        });
        report.entities.projects.skipped += 1;
        continue;
      }

      if (dryRun) {
        const fakeId = new Types.ObjectId();
        await saveMap(connection, {
          runId: run._id,
          dryRun,
          cache,
          entityType: 'project',
          oldCollection: 'projects',
          oldId: transformed.legacyId,
          newObjectId: fakeId,
        });
        report.entities.projects.imported += 1;
        continue;
      }

      const project = await projectRepository.createProject(payload);
      await getProjectStatsModel().create(buildEmptyProjectStats(project._id));

      if (transformed.hoursMinutes > 0) {
        const existingBudgets = await projectBudgetRepository.listByProjectId(project._id);
        if (!existingBudgets.length) {
          const budget = await projectBudgetRepository.createBudget({
            projectId: project._id,
            title: 'Imported hours budget',
            description: 'Created from legacy SQL project.hours',
            sourceType: 'initial',
            budgetType: 'hours',
            status: 'approved',
            requestedMinutes: transformed.hoursMinutes,
            approvedMinutes: transformed.hoursMinutes,
            consumedMinutes: 0,
            isDeleted: false,
          });
          await saveMap(connection, {
            runId: run._id,
            dryRun,
            cache,
            entityType: 'budget',
            oldCollection: 'projects',
            oldId: transformed.legacyId,
            newObjectId: budget._id,
          });
        }
      }

      await saveMap(connection, {
        runId: run._id,
        dryRun,
        cache,
        entityType: 'project',
        oldCollection: 'projects',
        oldId: transformed.legacyId,
        newObjectId: project._id,
      });
      report.entities.projects.imported += 1;
    } catch (err) {
      report.entities.projects.errors += 1;
      await recordError(connection, {
        runId: run._id,
        dryRun,
        entityType: 'project',
        oldCollection: 'projects',
        oldId: Number(raw.id),
        code: 'PROJECT_IMPORT_FAILED',
        message: err.message,
        rawData: raw,
      });
    }
  }

  for (const raw of data.project_users) {
    try {
      if (Number(raw.is_deleted) === 1) {
        report.entities.assignments.skipped += 1;
        continue;
      }

      const transformed = transformSqlAssignmentRow(raw);
      if (resolveCachedId(cache, 'project_assignment', 'project_users', transformed.legacyId)) {
        report.entities.assignments.skipped += 1;
        continue;
      }
      const projectId = transformed.legacyProjectId
        ? resolveCachedId(cache, 'project', 'projects', transformed.legacyProjectId)
        : null;
      const userId = transformed.legacyUserId
        ? resolveCachedId(cache, 'user', 'users', transformed.legacyUserId)
        : null;

      if (!projectId || !userId) {
        report.entities.assignments.skipped += 1;
        await recordError(connection, {
          runId: run._id,
          dryRun,
          entityType: 'project_assignment',
          oldCollection: 'project_users',
          oldId: transformed.legacyId,
          code: 'ORPHAN_ASSIGNMENT',
          message: 'Assignment references unknown project or user',
          rawData: raw,
        });
        continue;
      }

      const payload = {
        ...transformed.payload,
        projectId,
        userId,
      };

      const existingAssignment = await projectAssignmentRepository.findByProjectAndUser(
        projectId,
        userId
      );
      if (existingAssignment) {
        await saveMap(connection, {
          runId: run._id, dryRun, cache,
          entityType: 'project_assignment', oldCollection: 'project_users',
          oldId: transformed.legacyId, newObjectId: existingAssignment._id, status: 'merged',
        });
        report.entities.assignments.skipped += 1;
        continue;
      }

      if (dryRun) {
        report.entities.assignments.imported += 1;
        continue;
      }

      const assignment = await projectAssignmentRepository.createAssignment(payload);

      await saveMap(connection, {
        runId: run._id,
        dryRun,
        cache,
        entityType: 'project_assignment',
        oldCollection: 'project_users',
        oldId: transformed.legacyId,
        newObjectId: assignment._id,
      });
      report.entities.assignments.imported += 1;
    } catch (err) {
      report.entities.assignments.errors += 1;
      await recordError(connection, {
        runId: run._id,
        dryRun,
        entityType: 'project_assignment',
        oldCollection: 'project_users',
        oldId: Number(raw.id),
        code: 'ASSIGNMENT_IMPORT_FAILED',
        message: err.message,
        rawData: raw,
      });
    }
  }

  const usedCodes = new Set(
    (await workCategoryRepository.listCategories({ activeOnly: false })).map((c) => c.code)
  );

  for (const raw of data.project_default_tasks) {
    try {
      const transformed = transformSqlWorkCategoryRow(raw, { usedCodes });
      if (transformed.error) {
        report.entities.workCategories.errors += 1;
        continue;
      }


      if (resolveCachedId(cache, 'work_category', 'project_default_tasks', transformed.legacyId)) {
        report.entities.workCategories.skipped += 1;
        continue;
      }

      if (dryRun) {
        report.entities.workCategories.imported += 1;
        continue;
      }

      const existing = await workCategoryRepository.findByCode(transformed.payload.code);
      if (existing) {
        report.entities.workCategories.skipped += 1;
        await saveMap(connection, {
          runId: run._id,
          dryRun,
          cache,
          entityType: 'work_category',
          oldCollection: 'project_default_tasks',
          oldId: transformed.legacyId,
          newObjectId: existing._id,
          status: 'skipped',
        });
        continue;
      }

      const { getWorkCategoryModel } = require('../../../modules/activity/models/workCategory.model');
      const WorkCategory = getWorkCategoryModel();
      const category = await WorkCategory.create(transformed.payload);

      await saveMap(connection, {
        runId: run._id,
        dryRun,
        cache,
        entityType: 'work_category',
        oldCollection: 'project_default_tasks',
        oldId: transformed.legacyId,
        newObjectId: category._id,
      });
      report.entities.workCategories.imported += 1;
    } catch (err) {
      report.entities.workCategories.errors += 1;
      await recordError(connection, {
        runId: run._id,
        dryRun,
        entityType: 'work_category',
        oldCollection: 'project_default_tasks',
        oldId: Number(raw.id),
        code: 'WORK_CATEGORY_IMPORT_FAILED',
        message: err.message,
        rawData: raw,
      });
    }
  }

  report.validation = await validateSqlPhase1Import(connection, run._id, { dryRun });
  report.completedAt = new Date().toISOString();
  report.executionMs = Date.now() - started;

  if (!dryRun && run._id) {
    await completeSqlMigrationRun(connection, run._id, {
      status: report.validation.ok ? 'completed' : 'failed',
      summary: report,
    });
  }

  printPhase1Report(report);

  return report;
}

/**
 * Re-import users + assignments after v2:seed (roles). Reuses client/project maps from prior run.
 */
async function repairSqlPhase1UsersAndAssignments(options = {}) {
  const started = Date.now();
  const filePath = options.file;
  const priorRunId = options.priorRunId;
  const verbose = Boolean(options.verbose);

  if (!filePath || !priorRunId) {
    throw new Error('repair requires --file and --priorRunId');
  }

  const connection = await connectTargetForSeed();
  await ensureMigrationIndexes(connection);

  const cache = createMapCache();
  const loaded = await migrationMapRepository.listByRunId(connection, priorRunId);
  for (const map of loaded) {
    if (map.oldId === null || map.oldId === undefined) continue;
    cache.set(mapCacheKey(map.entityType, map.oldCollection, map.oldId), map.newObjectId);
  }

  const { data } = await extractPhase1TablesFromSqlFile(filePath, { verbose });
  const report = initPhase1Report({
    fileName: filePath.split('/').pop(),
    dryRun: false,
    parseStats: { counts: { users: data.users.length, project_users: data.project_users.length } },
  });

  const run = await createSqlMigrationRun(connection, {
    fileName: report.fileName,
    dryRun: false,
    notes: `SQL phase 1 repair (users+assignments) from run ${priorRunId}`,
  });
  report.runId = String(run._id);

  const roleCache = new Map();
  const seenEmails = new Set();

  report.entities.users.expected = data.users.length;
  report.entities.admins.expected = data.admins.length;
  report.entities.assignments.expected = data.project_users.length;

  for (const raw of data.users) {
    try {
      const row = transformSqlUserRow(raw);
      const existing = row.email ? await accountRepository.findByEmail(row.email) : null;
      if (existing) {
        const user = await userRepository.findByAccountId(existing._id);
        await saveMap(connection, {
          runId: run._id, dryRun: false, cache,
          entityType: 'account', oldCollection: 'users', oldId: row.legacyId, newObjectId: existing._id,
        });
        if (user) {
          await saveMap(connection, {
            runId: run._id, dryRun: false, cache,
            entityType: 'user', oldCollection: 'users', oldId: row.legacyId, newObjectId: user._id,
          });
        }
        report.entities.users.skipped += 1;
        continue;
      }
      await importSqlAccountUser({
        connection, run, cache, roleCache, row,
        oldCollection: 'users',
        entityStats: report.entities.users,
        seenEmails,
        dryRun: false,
      });
    } catch (err) {
      report.entities.users.errors += 1;
    }
  }

  for (const raw of data.admins) {
    try {
      const row = transformSqlAdminRow(raw);
      const existing = await accountRepository.findByEmail(row.email);
      if (existing) {
        const user = await userRepository.findByAccountId(existing._id);
        await saveMap(connection, {
          runId: run._id, dryRun: false, cache,
          entityType: 'account', oldCollection: 'admins', oldId: row.legacyId, newObjectId: existing._id,
        });
        if (user) {
          await saveMap(connection, {
            runId: run._id, dryRun: false, cache,
            entityType: 'user', oldCollection: 'admins', oldId: row.legacyId, newObjectId: user._id,
          });
        }
        report.entities.admins.skipped += 1;
        continue;
      }
      await importSqlAccountUser({
        connection, run, cache, roleCache, row,
        oldCollection: 'admins',
        entityStats: report.entities.admins,
        seenEmails,
        dryRun: false,
      });
    } catch (err) {
      report.entities.admins.errors += 1;
    }
  }

  for (const raw of data.project_users) {
    try {
      if (Number(raw.is_deleted) === 1) {
        report.entities.assignments.skipped += 1;
        continue;
      }

      const transformed = transformSqlAssignmentRow(raw);
      const projectId = transformed.legacyProjectId
        ? resolveCachedId(cache, 'project', 'projects', transformed.legacyProjectId)
        : null;
      const userId = transformed.legacyUserId
        ? resolveCachedId(cache, 'user', 'users', transformed.legacyUserId)
        : null;

      if (!projectId || !userId) {
        report.entities.assignments.skipped += 1;
        continue;
      }

      const payload = { ...transformed.payload, projectId, userId };
      let assignment = await projectAssignmentRepository.findByProjectAndUser(projectId, userId);
      if (!assignment) {
        assignment = await projectAssignmentRepository.createAssignment(payload);
      }

      await saveMap(connection, {
        runId: run._id, dryRun: false, cache,
        entityType: 'project_assignment',
        oldCollection: 'project_users',
        oldId: transformed.legacyId,
        newObjectId: assignment._id,
      });
      report.entities.assignments.imported += 1;
    } catch (err) {
      report.entities.assignments.errors += 1;
    }
  }

  report.executionMs = Date.now() - started;
  report.completedAt = new Date().toISOString();
  await completeSqlMigrationRun(connection, run._id, { status: 'completed', summary: report });
  printPhase1Report(report);
  return report;
}

module.exports = {
  runSqlPhase1Migration,
  repairSqlPhase1UsersAndAssignments,
  rollbackSqlPhase1Run,
};
