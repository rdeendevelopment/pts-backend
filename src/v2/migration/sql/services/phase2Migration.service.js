const { Types } = require('mongoose');
const { connectTargetForSeed } = require('../../helpers/dualConnection.helper');
const { ensureMigrationIndexes } = require('../../models');
const migrationMapRepository = require('../../repositories/migrationMap.repository');
const migrationErrorRepository = require('../../repositories/migrationError.repository');
const { extractPhase2TablesFromSqlFile } = require('../parsers/sqlInsertStream.parser');
const {
  buildDailyNotesIndex,
  expandSqlWorkingHoursRow,
  buildTimeEntryPayload,
  buildTimeWeekPayload,
} = require('../transformers/sqlActivity.transformer');
const {
  entryMapOldId,
  weekMapOldId,
  buildEntryChecksum,
  coerceBool,
} = require('../helpers/phase2Checksum.helper');
const {
  loadPhase1MapCache,
  loadPhase2EntryMapCache,
  resolveMapId,
} = require('../helpers/phase2MapLoader.helper');
const { getTimeWeekModel } = require('../../../modules/activity/models/timeWeek.model');
const { initPhase2Report, bumpError, printPhase2Report } = require('../helpers/phase2Reporter.helper');
const { createSqlMigrationRun, completeSqlMigrationRun } = require('./sqlMigrationRun.service');
const { rollbackSqlPhase2Run } = require('./phase2Reset.service');
const { validateSqlPhase2Import } = require('./phase2Validation.service');
const { getWeekBounds } = require('../../../modules/activity/helpers/week.helper');
const timeWeekRepository = require('../../../modules/activity/repositories/timeWeek.repository');
const timeEntryRepository = require('../../../modules/activity/repositories/timeEntry.repository');
const workCategoryRepository = require('../../../modules/activity/repositories/workCategory.repository');
const projectAssignmentRepository = require('../../../modules/projects/repositories/projectAssignment.repository');
const { getTimeEntryModel } = require('../../../modules/activity/models/timeEntry.model');
const { getProjectAssignmentModel } = require('../../../modules/projects/models/projectAssignment.model');

const TRANSFORM_VERSION = 'sql-phase2-1.0.0';
const BATCH_SIZE = 500;
const MAX_DB_RETRIES = 5;

async function withDbRetry(fn, { label = 'db-op' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_DB_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = ['MongoServerSelectionError', 'MongoNetworkError', 'MongoTimeoutError']
        .includes(err.name);
      if (!retryable || attempt === MAX_DB_RETRIES) throw err;
      const delay = Math.min(attempt * 2000, 10000);
      // eslint-disable-next-line no-console
      console.warn(`[phase2] ${label} failed (${err.message}), retry ${attempt}/${MAX_DB_RETRIES} in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function preloadAssignmentCache() {
  const ProjectAssignment = getProjectAssignmentModel();
  const rows = await ProjectAssignment.find({
    isDeleted: false,
    status: { $in: ['active', 'inactive'] },
  })
    .select('_id projectId userId')
    .lean();

  const cache = new Map();
  for (const row of rows) {
    cache.set(`${String(row.projectId)}:${String(row.userId)}`, row);
  }
  return cache;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function recordError(connection, { runId, dryRun, entityType, oldCollection, oldId, code, message, rawData }) {
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

async function saveMap(connection, { runId, dryRun, entityType, oldCollection, oldId, newObjectId, metadata = {} }) {
  if (dryRun || !runId) return;
  await migrationMapRepository.upsertMap(connection, {
    runId,
    entityType,
    oldCollection,
    oldId,
    oldObjectId: null,
    newObjectId,
    status: 'mapped',
    migratedAt: new Date(),
    metadata: { transformVersion: TRANSFORM_VERSION, ...metadata },
  });
}

function entryDayBounds(entryDate) {
  const start = new Date(entryDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(entryDate);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function parseDuplicateObjectId(error) {
  const message = String(error?.message || '');
  const match = message.match(/ObjectId\('([a-f0-9]{24})'\)/i);
  return match ? match[1] : null;
}

async function findExistingEntryByFingerprint({ userId, projectId, assignmentId, entryDate, minutes }) {
  const { start, end } = entryDayBounds(entryDate);
  const TimeEntry = getTimeEntryModel();
  return TimeEntry.findOne({
    userId,
    projectId,
    assignmentId,
    minutes,
    entryDate: { $gte: start, $lte: end },
    isDeleted: false,
  }).lean();
}

async function preloadWeekCacheFromDb() {
  const TimeWeek = getTimeWeekModel();
  const weeks = await TimeWeek.find({ isDeleted: false }).select('_id userId weekStartDate').lean();
  const cache = new Map();
  for (const week of weeks) {
    const key = `${String(week.userId)}:${new Date(week.weekStartDate).toISOString()}`;
    cache.set(key, week._id);
  }
  return cache;
}

async function recalculateAllWeekTotals({ verbose = false, affectedWeekIds = [] } = {}) {
  const TimeWeek = getTimeWeekModel();
  const zeroTotalQuery = {
    isDeleted: false,
    $or: [{ totalMinutes: 0 }, { totalEntries: 0 }],
  };
  const affectedIds = [...new Set(affectedWeekIds)].map((id) => new Types.ObjectId(id));
  const query = affectedIds.length
    ? { $or: [zeroTotalQuery, { _id: { $in: affectedIds }, isDeleted: false }] }
    : zeroTotalQuery;
  const weeks = await TimeWeek.find(query).select('_id').lean();

  let count = 0;
  for (const week of weeks) {
    await timeWeekRepository.recalculateWeekTotals(week._id);
    count += 1;
    if (verbose && count % 200 === 0) {
      // eslint-disable-next-line no-console
      console.log(`[phase2] recalculated ${count}/${weeks.length} weeks`);
    }
  }
  return count;
}

async function synchronizeAffectedWeekStatuses(affectedWeekIds = []) {
  let updated = 0;

  for (const weekId of new Set(affectedWeekIds)) {
    const week = await getTimeWeekModel().findById(weekId).lean();
    if (!week || (week.status === 'approved' && week.approvedBy)) continue;

    const entries = await getTimeEntryModel().find({
      timeWeekId: week._id,
      isDeleted: false,
      status: { $in: ['draft', 'submitted', 'approved'] },
    }).select('status lockedAt approvedAt updatedAt').lean();
    if (!entries.length) continue;

    const hasDraft = entries.some((entry) => entry.status === 'draft');
    const hasSubmitted = entries.some((entry) => entry.status === 'submitted');
    const status = hasDraft ? 'draft' : (hasSubmitted ? 'submitted' : 'approved');
    const latestTimestamp = entries
      .map((entry) => entry.approvedAt || entry.lockedAt || entry.updatedAt)
      .filter(Boolean)
      .sort((a, b) => b - a)[0] || null;

    await timeWeekRepository.updateWeek(week._id, {
      status,
      submittedAt: status === 'draft' ? null : latestTimestamp,
      approvedAt: status === 'approved' ? latestTimestamp : null,
      approvedBy: status === 'approved' ? week.approvedBy : null,
      lockedAt: status === 'draft' ? null : latestTimestamp,
    });
    updated += 1;
  }

  return updated;
}

async function resolveDefaultWorkCategoryId() {
  const categories = await workCategoryRepository.listCategories({ activeOnly: true });
  const fallback = categories.find((c) => c.isDefault) || categories[0];
  return fallback?._id || null;
}

/**
 * Phase 2: working_hours + daily_notes → pts_time_weeks / pts_time_entries
 * Requires Phase 1 pts_migration_maps for users, projects, work categories.
 */
async function runSqlPhase2Migration(options = {}) {
  const started = Date.now();
  const filePath = options.file;
  const dryRun = options.dryRun !== false;
  const verbose = Boolean(options.verbose);
  const mode = options.mode || 'insert-only';
  const resume = options.resume !== false;
  const batchSize = Number(options.batchSize || BATCH_SIZE);

  if (!filePath) throw new Error('--file is required');

  const connection = await connectTargetForSeed();
  await ensureMigrationIndexes(connection);

  if (options.reset) {
    if (!options.runId) throw new Error('--reset=true requires --runId=<phase2-run-id>');
    await rollbackSqlPhase2Run(connection, options.runId);
  }

  const phase1Maps = await loadPhase1MapCache(connection);
  if (!phase1Maps.size) {
    throw new Error('No Phase 1 migration maps found. Run migrate:phase1 first.');
  }

  const existingEntryMaps = await loadPhase2EntryMapCache(connection);
  if (verbose && existingEntryMaps.size) {
    // eslint-disable-next-line no-console
    console.log(`[phase2] loaded ${existingEntryMaps.size} existing entry maps (resume)`);
  }

  const defaultCategoryId = await resolveDefaultWorkCategoryId();
  if (!defaultCategoryId) {
    throw new Error('No work categories in V2. Run npm run v2:seed first.');
  }

  const { data, stats: parseStats } = await extractPhase2TablesFromSqlFile(filePath, { verbose });
  if (verbose) {
    // eslint-disable-next-line no-console
    console.log('[phase2] SQL parse complete', parseStats.counts);
  }
  const dailyNotesIndex = buildDailyNotesIndex(data.daily_notes || []);
  const report = initPhase2Report({
    fileName: filePath.split('/').pop(),
    dryRun,
    mode,
    resume,
    parseStats,
  });

  report.dailyNotes.attached = [...dailyNotesIndex.values()]
    .reduce((sum, m) => sum + m.size, 0);
  report.workingHours.expected = data.working_hours.length;

  const run = await createSqlMigrationRun(connection, {
    fileName: report.fileName,
    dryRun,
    notes: `SQL phase 2 activity import (${dryRun ? 'dry-run' : 'live'}, ${mode})`,
  });
  report.runId = run._id ? String(run._id) : null;

  const weekCache = resume && !dryRun
    ? await preloadWeekCacheFromDb()
    : new Map();
  const assignmentCache = await preloadAssignmentCache();
  const affectedWeekIds = new Set();
  const usersAffected = new Set();
  const projectsAffected = new Set();
  const pendingEntries = [];
  let processedCount = 0;

  if (verbose) {
    // eslint-disable-next-line no-console
    console.log('[phase2] building pending entry list...');
  }

  for (const rawRow of data.working_hours) {
    if (coerceBool(rawRow.is_deleted)) {
      report.workingHours.skipped += 1;
      continue;
    }

    const expanded = expandSqlWorkingHoursRow(rawRow, dailyNotesIndex);
    report.expandedEntries.expected += expanded.length;

    for (const entry of expanded) {
      const mapOldId = entryMapOldId(entry.legacyWorkingHoursId, entry.dayKey);

      if (existingEntryMaps.has(mapOldId)) {
        report.expandedEntries.duplicate += 1;
        if (mode === 'insert-only') continue;
      }

      const userId = resolveMapId(phase1Maps, 'user', 'users', entry.legacyUserId);
      const projectId = resolveMapId(phase1Maps, 'project', 'projects', entry.legacyProjectId);
      const workCategoryId = entry.legacyTaskId
        ? resolveMapId(phase1Maps, 'work_category', 'project_default_tasks', entry.legacyTaskId)
        : null;
      const budgetId = resolveMapId(phase1Maps, 'budget', 'projects', entry.legacyProjectId);

      if (!userId) {
        report.expandedEntries.skipped += 1;
        bumpError(report, 'MISSING_USER_MAP');
        await recordError(connection, {
          runId: run._id, dryRun, entityType: 'time_entry', oldCollection: 'working_hours',
          oldId: mapOldId, code: 'MISSING_USER_MAP',
          message: `No user map for legacy user_id ${entry.legacyUserId}`,
          rawData: { legacyWorkingHoursId: entry.legacyWorkingHoursId, dayKey: entry.dayKey },
        });
        continue;
      }

      if (!projectId) {
        report.expandedEntries.skipped += 1;
        bumpError(report, 'MISSING_PROJECT_MAP');
        await recordError(connection, {
          runId: run._id, dryRun, entityType: 'time_entry', oldCollection: 'working_hours',
          oldId: mapOldId, code: 'MISSING_PROJECT_MAP',
          message: `No project map for legacy project_id ${entry.legacyProjectId}`,
          rawData: { legacyWorkingHoursId: entry.legacyWorkingHoursId, dayKey: entry.dayKey },
        });
        continue;
      }

      const categoryId = workCategoryId || defaultCategoryId;
      if (!categoryId) {
        report.expandedEntries.skipped += 1;
        bumpError(report, 'MISSING_WORK_CATEGORY');
        continue;
      }

      if (!entry.entryDate || !Number.isFinite(entry.minutes)) {
        report.expandedEntries.skipped += 1;
        bumpError(report, 'INVALID_DURATION');
        continue;
      }

      pendingEntries.push({
        entry,
        mapOldId,
        userId,
        projectId,
        workCategoryId: categoryId,
        budgetId,
        checksum: buildEntryChecksum({
          workingHoursId: entry.legacyWorkingHoursId,
          dayKey: entry.dayKey,
          userLegacyId: entry.legacyUserId,
          projectLegacyId: entry.legacyProjectId,
          minutes: entry.minutes,
          note: entry.description,
        }),
      });
    }
  }

  if (verbose) {
    // eslint-disable-next-line no-console
    console.log(`[phase2] pending ${pendingEntries.length} entries to process`);
  }

  for (const batch of chunkArray(pendingEntries, batchSize)) {
    for (const item of batch) {
      const { entry, mapOldId, userId, projectId, workCategoryId, budgetId, checksum } = item;

      const assignmentKey = `${String(projectId)}:${String(userId)}`;
      let assignment = assignmentCache.get(assignmentKey) || null;
      if (!assignment) {
        assignment = dryRun
          ? { _id: new Types.ObjectId() }
          : await withDbRetry(
            () => projectAssignmentRepository.createAssignment({
              projectId,
              userId,
              role: 'member',
              status: 'active',
              allocation: {
                allocatedMinutes: 0,
                capPeriod: 'project',
                allowExceed: false,
                canLogTime: true,
              },
              stats: { consumedMinutes: 0, remainingMinutes: 0 },
              assignedAt: entry.entryDate || new Date(),
            }),
            { label: 'createMissingAssignment' }
          );
        assignmentCache.set(assignmentKey, assignment);
      }

      const { weekStartDate, weekEndDate } = getWeekBounds(entry.entryDate);
      const weekKey = `${String(userId)}:${weekStartDate.toISOString()}`;
      let timeWeekId = weekCache.get(weekKey);

      if (!timeWeekId) {
        if (dryRun) {
          timeWeekId = new Types.ObjectId();
          weekCache.set(weekKey, timeWeekId);
          report.weeks.created += 1;
        } else {
          const weekMapId = weekMapOldId(entry.legacyUserId, weekStartDate);
          let week = await timeWeekRepository.findByUserAndWeekStart(userId, weekStartDate);

          if (!week) {
            week = await withDbRetry(
              () => timeWeekRepository.createWeek(buildTimeWeekPayload({
                userId,
                weekStartDate,
                weekEndDate,
                latestEntryDate: entry.updatedAt || entry.entryDate,
                approvedDate: entry.approvedDate,
              })),
              { label: 'createWeek' }
            );
            report.weeks.created += 1;
            await saveMap(connection, {
              runId: run._id, dryRun: false,
              entityType: 'time_week', oldCollection: 'sql_week', oldId: weekMapId,
              newObjectId: week._id,
            });
          } else {
            report.weeks.skipped += 1;
          }

          timeWeekId = week._id;
          weekCache.set(weekKey, timeWeekId);
        }
      }

      if (!timeWeekId) {
        report.expandedEntries.errors += 1;
        bumpError(report, 'WEEK_CREATE_FAILED');
        continue;
      }

      const payload = buildTimeEntryPayload({
        timeWeekId,
        projectId,
        assignmentId: assignment._id,
        userId,
        budgetId,
        workCategoryId,
        entry,
      });

      if (dryRun) {
        report.expandedEntries.imported += 1;
        report.totals.importedMinutes += entry.minutes;
        usersAffected.add(String(userId));
        projectsAffected.add(String(projectId));
        if (!report.totals.dateRange.min || entry.entryDate < new Date(report.totals.dateRange.min)) {
          report.totals.dateRange.min = entry.entryDate.toISOString().slice(0, 10);
        }
        if (!report.totals.dateRange.max || entry.entryDate > new Date(report.totals.dateRange.max)) {
          report.totals.dateRange.max = entry.entryDate.toISOString().slice(0, 10);
        }
        continue;
      }

      let isNewImport = false;

      if (mode === 'upsert' && existingEntryMaps.has(mapOldId)) {
        const existing = existingEntryMaps.get(mapOldId);
        await getTimeEntryModel().findByIdAndUpdate(existing.newObjectId, { $set: payload });
        report.expandedEntries.imported += 1;
        isNewImport = true;
        affectedWeekIds.add(String(timeWeekId));
      } else {
        let created = null;
        let isDuplicate = false;

        if (!created) {
          try {
            created = await withDbRetry(
              () => timeEntryRepository.createEntry({ ...payload }),
              { label: 'createEntry' }
            );
          } catch (err) {
            if (err.code === 11000) {
              const dupId = parseDuplicateObjectId(err);
              created = dupId
                ? await getTimeEntryModel().findById(dupId).lean()
                : await findExistingEntryByFingerprint({
                  userId,
                  projectId,
                  assignmentId: assignment._id,
                  entryDate: entry.entryDate,
                  minutes: entry.minutes,
                });
              if (!created) throw err;
              isDuplicate = true;
            } else {
              throw err;
            }
          }
        }

        await withDbRetry(
          () => saveMap(connection, {
            runId: run._id, dryRun: false,
            entityType: 'time_entry', oldCollection: 'working_hours', oldId: mapOldId,
            newObjectId: created._id,
            metadata: { sourceHash: checksum, dayKey: entry.dayKey },
          }),
          { label: 'saveMap' }
        );
        existingEntryMaps.set(mapOldId, { newObjectId: created._id });

        if (isDuplicate) {
          report.expandedEntries.duplicate += 1;
        } else {
          report.expandedEntries.imported += 1;
          isNewImport = true;
        }
        affectedWeekIds.add(String(timeWeekId));
      }

      processedCount += 1;
      if (verbose && processedCount % 1000 === 0) {
        // eslint-disable-next-line no-console
        console.log(`[phase2] processed ${processedCount}/${pendingEntries.length} entries`);
      }

      if (isNewImport) {
        report.totals.importedMinutes += entry.minutes;
      }
      usersAffected.add(String(userId));
      projectsAffected.add(String(projectId));
      if (!report.totals.dateRange.min || entry.entryDate < new Date(report.totals.dateRange.min)) {
        report.totals.dateRange.min = entry.entryDate.toISOString().slice(0, 10);
      }
      if (!report.totals.dateRange.max || entry.entryDate > new Date(report.totals.dateRange.max)) {
        report.totals.dateRange.max = entry.entryDate.toISOString().slice(0, 10);
      }
    }
  }

  if (!dryRun) {
    await synchronizeAffectedWeekStatuses([...affectedWeekIds]);
    if (verbose) {
      // eslint-disable-next-line no-console
      console.log('[phase2] recalculating week totals...');
    }
    const recalculated = await recalculateAllWeekTotals({
      verbose,
      affectedWeekIds: [...affectedWeekIds],
    });
    report.weeks.updated = recalculated;
  }

  report.totals.importedHours = report.totals.importedMinutes / 60;
  report.totals.usersAffected = usersAffected.size;
  report.totals.projectsAffected = projectsAffected.size;
  report.validation = await validateSqlPhase2Import(connection, run._id, { dryRun });
  report.completedAt = new Date().toISOString();
  report.executionMs = Date.now() - started;

  if (!dryRun && run._id) {
    await completeSqlMigrationRun(connection, run._id, {
      status: report.validation.ok ? 'completed' : 'failed',
      summary: report,
    });
  }

  printPhase2Report(report);
  return report;
}

module.exports = {
  runSqlPhase2Migration,
  rollbackSqlPhase2Run,
};
