const { Types } = require('mongoose');
const migrationMapRepository = require('../../repositories/migrationMap.repository');
const migrationErrorRepository = require('../../repositories/migrationError.repository');
const migrationRunRepository = require('../../repositories/migrationRun.repository');
const { getAccountModel } = require('../../../modules/auth/models/account.model');
const { getUserModel } = require('../../../modules/users/models/user.model');
const { getClientModel } = require('../../../modules/clients/models/client.model');
const { getProjectModel } = require('../../../modules/projects/models/project.model');
const { getProjectBudgetModel } = require('../../../modules/projects/models/projectBudget.model');
const { getProjectStatsModel } = require('../../../modules/projects/models/projectStats.model');
const { getProjectAssignmentModel } = require('../../../modules/projects/models/projectAssignment.model');
const { getWorkCategoryModel } = require('../../../modules/activity/models/workCategory.model');
const { getAccountRoleModel } = require('../../../modules/rbac/models/accountRole.model');
const { getMigrationErrorModel } = require('../../models/migrationError.model');

const DELETE_ORDER = [
  'project_assignment',
  'budget',
  'project_stats',
  'project',
  'work_category',
  'client',
  'account_role',
  'user',
  'account',
];

async function deleteManyByIds(Model, ids) {
  if (!ids.length) return 0;
  const result = await Model.deleteMany({ _id: { $in: ids } });
  return result.deletedCount || 0;
}

/**
 * Delete only documents created under a migration run (via pts_migration_maps).
 * Never drops collections.
 */
async function rollbackSqlPhase1Run(connection, runId) {
  if (!runId || !Types.ObjectId.isValid(String(runId))) {
    throw new Error('rollback requires a valid --runId');
  }

  const run = await migrationRunRepository.findById(connection, runId);
  if (!run) {
    throw new Error(`Migration run not found: ${runId}`);
  }

  const maps = await migrationMapRepository.listByRunId(connection, runId);
  const grouped = new Map();

  for (const map of maps) {
    if (!grouped.has(map.entityType)) grouped.set(map.entityType, []);
    grouped.get(map.entityType).push(map.newObjectId);
  }

  const summary = {};

  const Assignment = getProjectAssignmentModel();
  const Budget = getProjectBudgetModel();
  const Stats = getProjectStatsModel();
  const Project = getProjectModel();
  const WorkCategory = getWorkCategoryModel();
  const Client = getClientModel();
  const AccountRole = getAccountRoleModel();
  const User = getUserModel();
  const Account = getAccountModel();

  const projectIds = grouped.get('project') || [];
  if (projectIds.length) {
    summary.budget = await deleteManyByIds(Budget, await Budget.find({ projectId: { $in: projectIds } }).distinct('_id'));
    summary.project_stats = await deleteManyByIds(Stats, await Stats.find({ projectId: { $in: projectIds } }).distinct('_id'));
  }

  for (const entityType of DELETE_ORDER) {
    const ids = grouped.get(entityType) || [];
    if (!ids.length) {
      summary[entityType] = 0;
      continue;
    }

    if (entityType === 'project_assignment') summary[entityType] = await deleteManyByIds(Assignment, ids);
    else if (entityType === 'project') summary[entityType] = await deleteManyByIds(Project, ids);
    else if (entityType === 'work_category') summary[entityType] = await deleteManyByIds(WorkCategory, ids);
    else if (entityType === 'client') summary[entityType] = await deleteManyByIds(Client, ids);
    else if (entityType === 'account_role') summary[entityType] = await deleteManyByIds(AccountRole, ids);
    else if (entityType === 'user') summary[entityType] = await deleteManyByIds(User, ids);
    else if (entityType === 'account') summary[entityType] = await deleteManyByIds(Account, ids);
  }

  const MigrationError = getMigrationErrorModel(connection);
  summary.migration_errors = (await MigrationError.deleteMany({ runId })).deletedCount || 0;
  summary.migration_maps = (await migrationMapRepository.deleteByRunId(connection, runId)).deletedCount || 0;

  await migrationRunRepository.updateRun(connection, runId, {
    status: 'rolled_back',
    finishedAt: new Date(),
  });

  return {
    runId: String(runId),
    status: 'rolled_back',
    deleted: summary,
  };
}

module.exports = {
  rollbackSqlPhase1Run,
};
