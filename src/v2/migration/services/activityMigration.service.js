const timeWeekRepository = require('../../modules/activity/repositories/timeWeek.repository');
const timeEntryRepository = require('../../modules/activity/repositories/timeEntry.repository');
const projectAssignmentRepository = require('../../modules/projects/repositories/projectAssignment.repository');
const { getWorkCategoryModel } = require('../../modules/activity/models/workCategory.model');
const { getTimeWeekModel } = require('../../modules/activity/models/timeWeek.model');
const { getTimeEntryModel } = require('../../modules/activity/models/timeEntry.model');
const { getWeekBounds } = require('../../modules/activity/helpers/week.helper');
const {
  loadLegacyTimeWeeks,
  loadLegacyTimeEntries,
  loadLegacyWorkingHours,
  loadLegacyActivityCategories,
} = require('../repositories/legacyData.repository');
const {
  transformLegacyTimeWeek,
  transformLegacyTimeEntry,
  expandWorkingHoursRows,
} = require('../transformers/activity.transformer');
const {
  chunkArray,
  prepareMigrationContext,
  finalizeMigrationStep,
  completeMigrationRun,
  findExistingMap,
  saveEntityMap,
  recordMigrationError,
  resolveMappedId,
} = require('../helpers/migrationBase.helper');

function createEmptyStats() {
  return {
    sourceWeekCount: 0,
    sourceEntryCount: 0,
    sourceWorkingHoursCount: 0,
    targetWeekCount: 0,
    targetEntryCount: 0,
    mappedWeekCount: 0,
    mappedEntryCount: 0,
    skippedCount: 0,
    errorCount: 0,
    workingHoursExpandedCount: 0,
  };
}

async function buildWorkCategoryMap(sourceConnection) {
  const WorkCategory = getWorkCategoryModel();
  const categories = await WorkCategory.find({ isDeleted: false }).lean();
  const defaultCategory = categories.find((row) => row.isDefault) || categories[0];

  const legacyCategories = await loadLegacyActivityCategories(sourceConnection);
  const byName = new Map(categories.map((row) => [String(row.name).toLowerCase(), row._id]));
  const legacyToV2 = new Map();

  for (const legacy of legacyCategories) {
    const match = byName.get(String(legacy.name || '').toLowerCase());
    legacyToV2.set(String(legacy._id), match || defaultCategory?._id);
  }

  return { legacyToV2, defaultCategoryId: defaultCategory?._id };
}

async function resolveOrCreateAssignment(ctx, projectId, userId) {
  if (!projectId || !userId) return null;

  let assignment = await projectAssignmentRepository.findByProjectAndUser(projectId, userId);
  if (assignment || ctx.dryRun) return assignment?._id || null;

  assignment = await projectAssignmentRepository.createAssignment({
    projectId,
    userId,
    role: 'member',
    status: 'active',
    allocation: { allocatedMinutes: 0, capPeriod: 'project', allowExceed: false, canLogTime: true },
    stats: { consumedMinutes: 0, remainingMinutes: 0 },
    assignedAt: new Date(),
  });
  return assignment._id;
}

async function resolveWeekForEntry(ctx, userId, entryDate, weekId = null) {
  if (weekId) {
    const mapped = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
      entityType: 'time_week',
      oldCollection: 'time_weeks',
      oldObjectId: weekId,
    });
    if (mapped) return mapped;
  }

  const { weekStartDate, weekEndDate } = getWeekBounds(entryDate);
  let week = await timeWeekRepository.findByUserAndWeekStart(userId, weekStartDate);
  if (week || ctx.dryRun) return week?._id || null;

  week = await timeWeekRepository.createWeek({
    userId,
    weekStartDate,
    weekEndDate,
    status: 'draft',
    totalMinutes: 0,
    totalEntries: 0,
  });
  return week._id;
}

async function migrateActivity(options = {}) {
  const ctx = await prepareMigrationContext({
    mode: options.mode || 'dry-run',
    batchSize: options.batchSize || 500,
    startedBy: options.startedBy || 'migrateActivity',
    notes: options.notes || 'Activity migration',
    runId: options.runId || null,
  });

  const stats = createEmptyStats();
  const categoryMap = await buildWorkCategoryMap(ctx.sourceConnection);
  const [weeks, entries, workingHours] = await Promise.all([
    loadLegacyTimeWeeks(ctx.sourceConnection),
    loadLegacyTimeEntries(ctx.sourceConnection),
    loadLegacyWorkingHours(ctx.sourceConnection),
  ]);

  stats.sourceWeekCount = weeks.length;
  stats.sourceEntryCount = entries.length;
  stats.sourceWorkingHoursCount = workingHours.length;

  for (const batch of chunkArray(weeks, ctx.batchSize)) {
    for (const doc of batch) {
      const existing = await findExistingMap(ctx.targetConnection, {
        entityType: 'time_week',
        oldCollection: 'time_weeks',
        oldObjectId: doc._id,
        oldId: doc.legacyId,
      });
      if (existing) {
        stats.skippedCount += 1;
        continue;
      }

      const userId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
        entityType: 'user',
        oldCollection: 'users',
        oldObjectId: doc.userId,
      });

      const transformed = transformLegacyTimeWeek(doc, userId);
      if (transformed.error) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'time_week',
          oldCollection: 'time_weeks',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          code: transformed.error.code,
          message: transformed.error.message,
          dryRun: ctx.dryRun,
        });
        continue;
      }

      if (!ctx.dryRun) {
        let week = await timeWeekRepository.findByUserAndWeekStart(
          userId,
          transformed.payload.weekStartDate
        );
        if (!week) {
          week = await timeWeekRepository.createWeek(transformed.payload);
        } else {
          week = await timeWeekRepository.updateWeek(week._id, transformed.payload);
        }

        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'time_week',
          oldCollection: 'time_weeks',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          newObjectId: week._id,
          metadata: { sourceHash: transformed.sourceHash },
        });
      }

      stats.mappedWeekCount += 1;
    }
  }

  const entrySource = entries.length ? entries : workingHours.flatMap(expandWorkingHoursRows);
  if (!entries.length) stats.workingHoursExpandedCount = entrySource.length;

  for (const batch of chunkArray(entrySource, ctx.batchSize)) {
    for (const doc of batch) {
      const oldCollection = doc.sourceCollection || 'time_entries';
      const existing = await findExistingMap(ctx.targetConnection, {
        entityType: 'time_entry',
        oldCollection,
        oldObjectId: doc.parentObjectId || doc._id,
        oldId: doc.legacyId,
      });
      if (existing) {
        stats.skippedCount += 1;
        continue;
      }

      const userId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
        entityType: 'user',
        oldCollection: 'users',
        oldObjectId: doc.userId,
      });
      const projectId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
        entityType: 'project',
        oldCollection: 'projects',
        oldObjectId: doc.projectId,
      });
      const budgetId = doc.budgetId
        ? await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
          entityType: 'budget',
          oldCollection: 'project_budgets',
          oldObjectId: doc.budgetId,
        })
        : null;
      const taskId = doc.taskId
        ? await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
          entityType: 'task',
          oldCollection: 'tasksV2',
          oldObjectId: doc.taskId,
        })
        : null;

      const assignmentId = await resolveOrCreateAssignment(ctx, projectId, userId);
      const timeWeekId = await resolveWeekForEntry(ctx, userId, doc.entryDate, doc.weekId || null);
      const workCategoryId = categoryMap.legacyToV2.get(String(doc.activityCategoryId || ''))
        || categoryMap.defaultCategoryId;

      const transformed = transformLegacyTimeEntry(doc, {
        timeWeekId,
        projectId,
        assignmentId,
        userId,
        budgetId,
        taskId,
        workCategoryId,
      });

      if (transformed.error) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'time_entry',
          oldCollection,
          oldObjectId: doc.parentObjectId || doc._id,
          oldId: doc.legacyId,
          code: transformed.error.code,
          message: transformed.error.message,
          dryRun: ctx.dryRun,
        });
        continue;
      }

      if (!ctx.dryRun) {
        const entry = await timeEntryRepository.createEntry(transformed.payload);
        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'time_entry',
          oldCollection,
          oldObjectId: doc.parentObjectId || doc._id,
          oldId: doc.legacyId,
          newObjectId: entry._id,
          metadata: {
            sourceHash: transformed.sourceHash,
            dayKey: doc.dayKey || null,
          },
        });
      }

      stats.mappedEntryCount += 1;
    }
  }

  stats.targetWeekCount = await getTimeWeekModel().countDocuments({ isDeleted: false });
  stats.targetEntryCount = await getTimeEntryModel().countDocuments({ isDeleted: false });

  const { report, reportPath } = await finalizeMigrationStep(
    ctx.targetConnection,
    ctx.run,
    'activity',
    stats,
    ctx
  );

  if (!ctx.dryRun && !options.skipRunComplete) {
    await completeMigrationRun(ctx.targetConnection, ctx.run._id, {
      status: stats.errorCount ? 'completed_with_errors' : 'completed',
      steps: [{
        entityType: 'activity',
        status: stats.errorCount ? 'completed_with_errors' : 'completed',
        finishedAt: new Date(),
        sourceCount: stats.sourceWeekCount + stats.sourceEntryCount,
        insertedCount: stats.mappedWeekCount + stats.mappedEntryCount,
        skippedCount: stats.skippedCount,
        errorCount: stats.errorCount,
      }],
    });
  }

  return { ok: true, mode: ctx.mode, runId: String(ctx.run._id), reportPath, stats, report };
}

module.exports = { migrateActivity, createEmptyStats };
