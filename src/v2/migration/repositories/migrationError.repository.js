const { getMigrationErrorModel } = require('../models/migrationError.model');

async function createError(connection, payload) {
  const MigrationError = getMigrationErrorModel(connection);
  const docs = await MigrationError.create([payload]);
  return docs[0];
}

async function countOpenByRun(connection, runId, { entityType = null } = {}) {
  const MigrationError = getMigrationErrorModel(connection);
  const query = { runId, status: 'error' };
  if (entityType) query.entityType = entityType;
  return MigrationError.countDocuments(query).exec();
}

async function listByRun(connection, runId, { status = 'error', limit = 100 } = {}) {
  const MigrationError = getMigrationErrorModel(connection);
  return MigrationError.find({ runId, status })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
}

module.exports = {
  createError,
  countOpenByRun,
  listByRun,
};
