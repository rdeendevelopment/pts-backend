const { MONGO_DB, MONGO_V2_DB } = require('../../../../config/constants');
const {
  connectSourceDb,
  connectTargetDb,
  closeMigrationConnections,
} = require('./dualConnection.helper');
const { ensureMigrationIndexes } = require('../models');
const {
  createMigrationRun,
  completeMigrationRun,
} = require('../services/migrationRun.service');

function parseCliArgs(argv = []) {
  const args = {};
  for (const token of argv) {
    if (token.startsWith('--mode=')) args.mode = token.slice('--mode='.length);
    if (token.startsWith('--step=')) args.step = token.slice('--step='.length);
    if (token.startsWith('--batch-size=')) args.batchSize = token.slice('--batch-size='.length);
    if (token === '--dry-run') args.mode = 'dry-run';
  }
  return args;
}

async function withMigrationConnections(fn) {
  const source = await connectSourceDb();
  const target = await connectTargetDb();
  await ensureMigrationIndexes(target);
  return fn({ source, target });
}

async function runFoundationDryRun({ scriptName, notes }) {
  return withMigrationConnections(async ({ source, target }) => {
    const run = await createMigrationRun(target, {
      mode: 'dry-run',
      startedBy: scriptName,
      notes,
    });

    await completeMigrationRun(target, run._id, {
      status: 'completed',
      steps: [{
        entityType: 'foundation',
        status: 'skipped',
        startedAt: new Date(),
        finishedAt: new Date(),
        sourceCount: 0,
        insertedCount: 0,
        skippedCount: 0,
        errorCount: 0,
      }],
    });

    return {
      ok: true,
      script: scriptName,
      mode: 'dry-run',
      message: notes,
      runId: String(run._id),
      sourceDb: MONGO_DB,
      targetDb: MONGO_V2_DB,
    };
  });
}

module.exports = {
  parseCliArgs,
  withMigrationConnections,
  runFoundationDryRun,
  closeMigrationConnections,
};
