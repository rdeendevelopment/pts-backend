const { MONGO_V2_DB } = require('../../../../../config/constants');
const migrationRunRepository = require('../../repositories/migrationRun.repository');

async function createSqlMigrationRun(connection, {
  fileName,
  dryRun,
  startedBy = 'migrate-phase1',
  notes = null,
}) {
  if (dryRun) {
    return {
      _id: null,
      dryRun: true,
      source: 'sql_file',
      fileName,
      targetDb: MONGO_V2_DB,
    };
  }

  return migrationRunRepository.createRun(connection, {
    source: 'sql_file',
    fileName,
    mode: 'live',
    status: 'running',
    sourceDb: 'sql_file',
    targetDb: MONGO_V2_DB,
    startedAt: new Date(),
    startedBy,
    notes,
    options: { batchSize: 200, skipDeleted: true },
    steps: [],
  });
}

async function completeSqlMigrationRun(connection, runId, { status = 'completed', summary = null } = {}) {
  if (!runId) return null;

  return migrationRunRepository.updateRun(connection, runId, {
    status,
    finishedAt: new Date(),
    summary,
  });
}

module.exports = {
  createSqlMigrationRun,
  completeSqlMigrationRun,
};
