const clientRepository = require('../../modules/clients/repositories/client.repository');
const { getClientModel } = require('../../modules/clients/models/client.model');
const { loadLegacyClients } = require('../repositories/legacyData.repository');
const { transformLegacyClient } = require('../transformers/client.transformer');
const {
  chunkArray,
  prepareMigrationContext,
  finalizeMigrationStep,
  completeMigrationRun,
  findExistingMap,
  saveEntityMap,
  recordMigrationError,
} = require('../helpers/migrationBase.helper');

function createEmptyStats() {
  return {
    sourceCount: 0,
    targetClientCount: 0,
    mappedCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };
}

async function migrateClients(options = {}) {
  const ctx = await prepareMigrationContext({
    mode: options.mode || 'dry-run',
    batchSize: options.batchSize || 500,
    startedBy: options.startedBy || 'migrateClients',
    notes: options.notes || 'Clients migration',
    runId: options.runId || null,
  });

  const stats = createEmptyStats();
  const docs = await loadLegacyClients(ctx.sourceConnection);
  stats.sourceCount = docs.length;

  for (const batch of chunkArray(docs, ctx.batchSize)) {
    for (const doc of batch) {
      if (ctx.resume) {
        const existing = await findExistingMap(ctx.targetConnection, {
          entityType: 'client',
          oldCollection: 'clients',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
        });
        if (existing) {
          stats.skippedCount += 1;
          continue;
        }
      }

      const transformed = transformLegacyClient(doc);
      if (transformed.error) {
        stats.errorCount += 1;
        await recordMigrationError(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'client',
          oldCollection: 'clients',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          code: transformed.error.code,
          message: transformed.error.message,
          dryRun: ctx.dryRun,
          sourceSnapshot: { companyName: doc.companyName, legacyId: doc.legacyId },
        });
        continue;
      }

      let client = ctx.dryRun
        ? await clientRepository.findByNormalizedName(transformed.payload.normalizedName)
        : await clientRepository.findByNormalizedName(transformed.payload.normalizedName);

      if (!ctx.dryRun) {
        if (!client) {
          client = await clientRepository.createClient(transformed.payload);
        } else {
          client = await clientRepository.updateClient(client._id, transformed.payload);
        }
        await saveEntityMap(ctx.targetConnection, {
          runId: ctx.run._id,
          entityType: 'client',
          oldCollection: 'clients',
          oldObjectId: doc._id,
          oldId: doc.legacyId,
          newObjectId: client._id,
          metadata: { sourceHash: transformed.sourceHash },
        });
      } else if (!client) {
        client = { _id: transformed.oldObjectId };
      }

      stats.mappedCount += 1;
    }
  }

  stats.targetClientCount = await getClientModel().countDocuments({ isDeleted: false });
  const { report, reportPath } = await finalizeMigrationStep(
    ctx.targetConnection,
    ctx.run,
    'clients',
    stats,
    ctx
  );

  if (!ctx.dryRun && !options.skipRunComplete) {
    await completeMigrationRun(ctx.targetConnection, ctx.run._id, {
      status: stats.errorCount ? 'completed_with_errors' : 'completed',
      steps: [{
        entityType: 'clients',
        status: stats.errorCount ? 'completed_with_errors' : 'completed',
        finishedAt: new Date(),
        sourceCount: stats.sourceCount,
        insertedCount: stats.mappedCount,
        skippedCount: stats.skippedCount,
        errorCount: stats.errorCount,
      }],
    });
  }

  return { ok: true, mode: ctx.mode, runId: String(ctx.run._id), reportPath, stats, report };
}

module.exports = { migrateClients, createEmptyStats };
