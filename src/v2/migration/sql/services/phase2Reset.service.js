const { Types } = require('mongoose');
const migrationMapRepository = require('../../repositories/migrationMap.repository');
const migrationRunRepository = require('../../repositories/migrationRun.repository');
const { getTimeEntryModel } = require('../../../modules/activity/models/timeEntry.model');
const { getTimeWeekModel } = require('../../../modules/activity/models/timeWeek.model');
const { getActiveTimerModel } = require('../../../modules/activity/models/activeTimer.model');
const migrationErrorRepository = require('../../repositories/migrationError.repository');
const { getMigrationErrorModel } = require('../../models/migrationError.model');

async function deleteManyByIds(Model, ids) {
  if (!ids.length) return 0;
  const result = await Model.deleteMany({ _id: { $in: ids } });
  return result.deletedCount || 0;
}

async function rollbackSqlPhase2Run(connection, runId) {
  if (!runId || !Types.ObjectId.isValid(String(runId))) {
    throw new Error('rollback requires a valid --runId');
  }

  const run = await migrationRunRepository.findById(connection, runId);
  if (!run) throw new Error(`Migration run not found: ${runId}`);

  const maps = await migrationMapRepository.listByRunId(connection, runId);
  const entryIds = maps.filter((m) => m.entityType === 'time_entry').map((m) => m.newObjectId);
  const weekIds = maps.filter((m) => m.entityType === 'time_week').map((m) => m.newObjectId);

  const TimeEntry = getTimeEntryModel();
  const TimeWeek = getTimeWeekModel();
  const MigrationError = getMigrationErrorModel(connection);

  const deleted = {
    time_entries: await deleteManyByIds(TimeEntry, entryIds),
    time_weeks: await deleteManyByIds(TimeWeek, weekIds),
    migration_errors: (await MigrationError.deleteMany({ runId })).deletedCount || 0,
    migration_maps: (await migrationMapRepository.deleteByRunId(connection, runId)).deletedCount || 0,
  };

  await migrationRunRepository.updateRun(connection, runId, {
    status: 'rolled_back',
    finishedAt: new Date(),
  });

  return { runId: String(runId), status: 'rolled_back', deleted };
}

module.exports = {
  rollbackSqlPhase2Run,
};
