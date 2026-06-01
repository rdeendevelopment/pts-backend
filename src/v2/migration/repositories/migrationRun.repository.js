const { getMigrationRunModel } = require('../models/migrationRun.model');

async function createRun(connection, payload) {
  const MigrationRun = getMigrationRunModel(connection);
  const docs = await MigrationRun.create([payload]);
  return docs[0];
}

async function findById(connection, runId) {
  const MigrationRun = getMigrationRunModel(connection);
  return MigrationRun.findById(runId).exec();
}

async function updateRun(connection, runId, updates) {
  const MigrationRun = getMigrationRunModel(connection);
  return MigrationRun.findByIdAndUpdate(runId, { $set: updates }, { returnDocument: 'after' }).exec();
}

async function listRuns(connection, { limit = 20 } = {}) {
  const MigrationRun = getMigrationRunModel(connection);
  return MigrationRun.find({}).sort({ createdAt: -1 }).limit(limit).exec();
}

module.exports = {
  createRun,
  findById,
  updateRun,
  listRuns,
};
