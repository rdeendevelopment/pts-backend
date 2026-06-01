const projectRepository = require('../../modules/projects/repositories/project.repository');
const projectBudgetRepository = require('../../modules/projects/repositories/projectBudget.repository');
const projectAssignmentRepository = require('../../modules/projects/repositories/projectAssignment.repository');
const { getProjectModel } = require('../../modules/projects/models/project.model');
const { getProjectBudgetModel } = require('../../modules/projects/models/projectBudget.model');
const { getProjectAssignmentModel } = require('../../modules/projects/models/projectAssignment.model');
const { getProjectStatsModel } = require('../../modules/projects/models/projectStats.model');
const {
  loadLegacyProjects,
  loadLegacyBudgets,
  loadLegacyAssignments,
} = require('../repositories/legacyData.repository');
const {
  transformLegacyProject,
  transformLegacyBudget,
  transformLegacyAssignment,
  buildEmptyProjectStats,
} = require('../transformers/project.transformer');
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
    sourceProjectCount: 0,
    sourceBudgetCount: 0,
    sourceAssignmentCount: 0,
    targetProjectCount: 0,
    targetBudgetCount: 0,
    targetAssignmentCount: 0,
    mappedProjectCount: 0,
    mappedBudgetCount: 0,
    mappedAssignmentCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };
}

async function migrateProjects(options = {}) {
  const ctx = await prepareMigrationContext({
    mode: options.mode || 'dry-run',
    batchSize: options.batchSize || 500,
    startedBy: options.startedBy || 'migrateProjects',
    notes: options.notes || 'Projects migration',
    runId: options.runId || null,
  });

  const stats = createEmptyStats();
  const [projects, budgets, assignments] = await Promise.all([
    loadLegacyProjects(ctx.sourceConnection),
    loadLegacyBudgets(ctx.sourceConnection),
    loadLegacyAssignments(ctx.sourceConnection),
  ]);

  stats.sourceProjectCount = projects.length;
  stats.sourceBudgetCount = budgets.length;
  stats.sourceAssignmentCount = assignments.length;

  for (const batch of chunkArray(projects, ctx.batchSize)) {
    for (const doc of batch) {
      if (ctx.resume) {
        const existing = await findExistingMap(ctx.targetConnection, {
          entityType: 'project',
          oldCollection: 'projects',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
        });
        if (existing) {
          stats.skippedCount += 1;
          continue;
        }
      }

      const clientId = doc.clientId
        ? await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
          entityType: 'client',
          oldCollection: 'clients',
          oldObjectId: doc.clientId,
        })
        : null;

      const transformed = transformLegacyProject(doc, clientId);
      if (transformed.error) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'project',
          oldCollection: 'projects',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          code: transformed.error.code,
          message: transformed.error.message,
          dryRun: ctx.dryRun,
        });
        continue;
      }

      if (!ctx.dryRun) {
        let project = await projectRepository.findByClientAndNormalizedName(
          clientId,
          transformed.payload.normalizedName
        );
        if (!project) {
          project = await projectRepository.createProject(transformed.payload);
          await getProjectStatsModel().create(buildEmptyProjectStats(project._id));
        } else {
          project = await projectRepository.updateProject(project._id, transformed.payload);
        }

        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'project',
          oldCollection: 'projects',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          newObjectId: project._id,
          metadata: { sourceHash: transformed.sourceHash },
        });
      }

      stats.mappedProjectCount += 1;
    }
  }

  for (const batch of chunkArray(budgets, ctx.batchSize)) {
    for (const doc of batch) {
      if (ctx.resume) {
        const existing = await findExistingMap(ctx.targetConnection, {
          entityType: 'budget',
          oldCollection: 'project_budgets',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
        });
        if (existing) {
          stats.skippedCount += 1;
          continue;
        }
      }

      const projectId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
        entityType: 'project',
        oldCollection: 'projects',
        oldObjectId: doc.projectId,
      });

      const transformed = transformLegacyBudget(doc, projectId);
      if (transformed.error) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'budget',
          oldCollection: 'project_budgets',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          code: transformed.error.code,
          message: transformed.error.message,
          dryRun: ctx.dryRun,
        });
        continue;
      }

      if (!ctx.dryRun) {
        const budget = await projectBudgetRepository.createBudget(transformed.payload);
        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'budget',
          oldCollection: 'project_budgets',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          newObjectId: budget._id,
          metadata: { sourceHash: transformed.sourceHash },
        });
      }

      stats.mappedBudgetCount += 1;
    }
  }

  for (const batch of chunkArray(assignments, ctx.batchSize)) {
    for (const doc of batch) {
      if (ctx.resume) {
        const existing = await findExistingMap(ctx.targetConnection, {
          entityType: 'assignment',
          oldCollection: 'project_assignments',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
        });
        if (existing) {
          stats.skippedCount += 1;
          continue;
        }
      }

      const projectId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
        entityType: 'project',
        oldCollection: 'projects',
        oldObjectId: doc.projectId,
        oldId: doc.legacyProjectId,
      });
      const userId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
        entityType: 'user',
        oldCollection: 'users',
        oldObjectId: doc.userId,
        oldId: doc.legacyUserId,
      });

      const transformed = transformLegacyAssignment(doc, projectId, userId);
      if (transformed.error) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'assignment',
          oldCollection: 'project_assignments',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          code: transformed.error.code,
          message: transformed.error.message,
          dryRun: ctx.dryRun,
        });
        continue;
      }

      if (!ctx.dryRun) {
        let assignment = await projectAssignmentRepository.findByProjectAndUser(
          projectId,
          userId
        );
        if (!assignment) {
          assignment = await projectAssignmentRepository.createAssignment(transformed.payload);
        } else {
          assignment = await projectAssignmentRepository.updateAssignment(
            assignment._id,
            projectId,
            transformed.payload
          );
        }

        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'assignment',
          oldCollection: 'project_assignments',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          newObjectId: assignment._id,
          metadata: { sourceHash: transformed.sourceHash },
        });
      }

      stats.mappedAssignmentCount += 1;
    }
  }

  const [targetProjectCount, targetBudgetCount, targetAssignmentCount] = await Promise.all([
    getProjectModel().countDocuments({ isDeleted: false }),
    getProjectBudgetModel().countDocuments({ isDeleted: false }),
    getProjectAssignmentModel().countDocuments({ isDeleted: false }),
  ]);
  stats.targetProjectCount = targetProjectCount;
  stats.targetBudgetCount = targetBudgetCount;
  stats.targetAssignmentCount = targetAssignmentCount;

  const { report, reportPath } = await finalizeMigrationStep(
    ctx.targetConnection,
    ctx.run,
    'projects',
    stats,
    ctx
  );

  if (!ctx.dryRun && !options.skipRunComplete) {
    await completeMigrationRun(ctx.targetConnection, ctx.run._id, {
      status: stats.errorCount ? 'completed_with_errors' : 'completed',
      steps: [{
        entityType: 'projects',
        status: stats.errorCount ? 'completed_with_errors' : 'completed',
        finishedAt: new Date(),
        sourceCount: stats.sourceProjectCount + stats.sourceBudgetCount + stats.sourceAssignmentCount,
        insertedCount: stats.mappedProjectCount + stats.mappedBudgetCount + stats.mappedAssignmentCount,
        skippedCount: stats.skippedCount,
        errorCount: stats.errorCount,
      }],
    });
  }

  return { ok: true, mode: ctx.mode, runId: String(ctx.run._id), reportPath, stats, report };
}

module.exports = { migrateProjects, createEmptyStats };
