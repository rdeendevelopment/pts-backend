const projectFileRepository = require('../../modules/projects/repositories/projectFile.repository');
const { getProjectFileModel } = require('../../modules/projects/models/projectFile.model');
const { loadLegacyAttachments } = require('../repositories/legacyData.repository');
const {
  transformLegacyProjectAttachment,
  isProjectAttachment,
} = require('../transformers/attachment.transformer');
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
    sourceAttachmentCount: 0,
    projectAttachmentCount: 0,
    targetFileCount: 0,
    mappedCount: 0,
    skippedCount: 0,
    skippedNonProjectCount: 0,
    errorCount: 0,
  };
}

async function migrateAttachments(options = {}) {
  const ctx = await prepareMigrationContext({
    mode: options.mode || 'dry-run',
    batchSize: options.batchSize || 500,
    startedBy: options.startedBy || 'migrateAttachments',
    notes: options.notes || 'Project attachments migration',
    runId: options.runId || null,
  });

  const stats = createEmptyStats();
  const attachments = await loadLegacyAttachments(ctx.sourceConnection);
  stats.sourceAttachmentCount = attachments.length;

  const projectAttachments = attachments.filter(isProjectAttachment);
  stats.projectAttachmentCount = projectAttachments.length;
  stats.skippedNonProjectCount = attachments.length - projectAttachments.length;

  for (const batch of chunkArray(projectAttachments, ctx.batchSize)) {
    for (const doc of batch) {
      const existing = await findExistingMap(ctx.targetConnection, {
        entityType: 'project_file',
        oldCollection: 'attachments',
        oldObjectId: doc._id,
        oldId: doc.legacyId,
      });
      if (existing) {
        stats.skippedCount += 1;
        continue;
      }

      const projectId = await resolveMappedId(ctx.targetConnection, ctx.mapCache, {
        entityType: 'project',
        oldCollection: 'projects',
        oldObjectId: doc.parentId,
      });

      const transformed = transformLegacyProjectAttachment(doc, projectId);
      if (transformed.error) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'project_file',
          oldCollection: 'attachments',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          code: transformed.error.code,
          message: transformed.error.message,
          dryRun: ctx.dryRun,
          sourceSnapshot: {
            parentType: doc.parentType,
            parentId: doc.parentId,
            title: doc.title,
          },
        });
        continue;
      }

      if (!ctx.dryRun) {
        const file = await projectFileRepository.createFile(transformed.payload);
        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'project_file',
          oldCollection: 'attachments',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          newObjectId: file._id,
          metadata: { sourceHash: transformed.sourceHash },
        });
      }

      stats.mappedCount += 1;
    }
  }

  stats.targetFileCount = await getProjectFileModel().countDocuments({ isDeleted: false });

  const { report, reportPath } = await finalizeMigrationStep(
    ctx.targetConnection,
    ctx.run,
    'attachments',
    stats,
    ctx
  );

  if (!ctx.dryRun && !options.skipRunComplete) {
    await completeMigrationRun(ctx.targetConnection, ctx.run._id, {
      status: stats.errorCount ? 'completed_with_errors' : 'completed',
      steps: [{
        entityType: 'attachments',
        status: stats.errorCount ? 'completed_with_errors' : 'completed',
        finishedAt: new Date(),
        sourceCount: stats.projectAttachmentCount,
        insertedCount: stats.mappedCount,
        skippedCount: stats.skippedCount,
        errorCount: stats.errorCount,
      }],
    });
  }

  return { ok: stats.errorCount === 0, mode: ctx.mode, runId: String(ctx.run._id), reportPath, stats, report };
}

module.exports = { migrateAttachments, createEmptyStats };
