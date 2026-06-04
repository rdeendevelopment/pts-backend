const { Types } = require('mongoose');
const { getAccountModel } = require('../../../modules/auth/models/account.model');
const { getUserModel } = require('../../../modules/users/models/user.model');
const { getClientModel } = require('../../../modules/clients/models/client.model');
const { getProjectModel } = require('../../../modules/projects/models/project.model');
const { getProjectAssignmentModel } = require('../../../modules/projects/models/projectAssignment.model');
const { getWorkCategoryModel } = require('../../../modules/activity/models/workCategory.model');
const migrationMapRepository = require('../../repositories/migrationMap.repository');

function isObjectId(value) {
  return Types.ObjectId.isValid(String(value));
}

async function validateSqlPhase1Import(connection, runId, { dryRun = true } = {}) {
  const issues = [];

  const collections = [
    { name: 'pts_accounts', model: getAccountModel() },
    { name: 'pts_users', model: getUserModel() },
    { name: 'pts_clients', model: getClientModel() },
    { name: 'pts_projects', model: getProjectModel() },
    { name: 'pts_project_assignments', model: getProjectAssignmentModel() },
    { name: 'pts_work_categories', model: getWorkCategoryModel() },
  ];

  for (const { name, model } of collections) {
    const numericIdField = await model.countDocuments({
      $or: [
        { legacyId: { $exists: true } },
        { mysqlId: { $exists: true } },
        { sourceId: { $exists: true } },
      ],
    }).exec();

    if (numericIdField > 0) {
      issues.push(`${name} contains forbidden legacy id fields`);
    }
  }

  const orphanProjects = await getProjectModel().aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: 'pts_clients',
        localField: 'clientId',
        foreignField: '_id',
        as: 'client',
      },
    },
    { $match: { client: { $size: 0 } } },
    { $count: 'count' },
  ]);
  if (orphanProjects[0]?.count) {
    issues.push(`Found ${orphanProjects[0].count} projects without a client reference`);
  }

  const orphanAssignments = await getProjectAssignmentModel().aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: 'pts_projects',
        localField: 'projectId',
        foreignField: '_id',
        as: 'project',
      },
    },
    { $match: { project: { $size: 0 } } },
    { $count: 'count' },
  ]);
  if (orphanAssignments[0]?.count) {
    issues.push(`Found ${orphanAssignments[0].count} assignments without a project`);
  }

  const orphanAssignmentUsers = await getProjectAssignmentModel().aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: 'pts_users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $match: { user: { $size: 0 } } },
    { $count: 'count' },
  ]);
  if (orphanAssignmentUsers[0]?.count) {
    issues.push(`Found ${orphanAssignmentUsers[0].count} assignments without a user`);
  }

  if (runId && !dryRun) {
    const maps = await migrationMapRepository.listByRunId(connection, runId);
    for (const map of maps) {
      if (!isObjectId(map.newObjectId)) {
        issues.push(`Map ${map._id} has invalid newObjectId`);
      }
      if (map.oldId !== null && map.oldId !== undefined && !Number.isInteger(Number(map.oldId))) {
        issues.push(`Map ${map._id} has invalid legacy oldId`);
      }
    }

    const duplicateMaps = await migrationMapRepository.listByRunId(connection, runId);
    const seen = new Set();
    for (const map of duplicateMaps) {
      const key = `${map.entityType}:${map.oldCollection}:${map.oldId}`;
      if (seen.has(key)) issues.push(`Duplicate migration map key ${key}`);
      seen.add(key);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

module.exports = {
  validateSqlPhase1Import,
};
