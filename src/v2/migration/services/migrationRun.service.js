const { MONGO_DB, MONGO_V2_DB } = require('../../../../config/constants');
const env = require('../../config/env');
const migrationRunRepository = require('../repositories/migrationRun.repository');

async function createMigrationRun(connection, {
  mode = 'dry-run',
  startedBy = 'script',
  notes = null,
  options = {},
} = {}) {
  return migrationRunRepository.createRun(connection, {
    mode,
    status: 'running',
    sourceDb: MONGO_DB,
    targetDb: MONGO_V2_DB,
    startedAt: new Date(),
    options: {
      batchSize: Number(options.batchSize || 500),
      skipDeleted: options.skipDeleted !== false,
      weekStartDay: options.weekStartDay || env.v2.weekStartDay,
      businessTimezone: options.businessTimezone || env.v2.businessTimezone,
    },
    startedBy,
    notes,
    steps: [],
  });
}

async function completeMigrationRun(connection, runId, { status = 'completed', steps = [] } = {}) {
  return migrationRunRepository.updateRun(connection, runId, {
    status,
    finishedAt: new Date(),
    steps,
  });
}

module.exports = {
  createMigrationRun,
  completeMigrationRun,
};
