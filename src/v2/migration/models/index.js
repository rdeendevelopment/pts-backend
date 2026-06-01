const { getMigrationRunModel } = require('./migrationRun.model');
const { getMigrationMapModel } = require('./migrationMap.model');
const { getMigrationErrorModel } = require('./migrationError.model');

async function ensureMigrationIndexes(connection) {
  const MigrationRun = getMigrationRunModel(connection);
  const MigrationMap = getMigrationMapModel(connection);
  const MigrationError = getMigrationErrorModel(connection);

  await Promise.all([
    MigrationRun.createIndexes(),
    MigrationMap.createIndexes(),
    MigrationError.createIndexes(),
  ]);
}

module.exports = {
  getMigrationRunModel,
  getMigrationMapModel,
  getMigrationErrorModel,
  ensureMigrationIndexes,
};
