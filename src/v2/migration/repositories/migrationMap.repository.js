const { getMigrationMapModel } = require('../models/migrationMap.model');

async function findMappedByOldRef(connection, { entityType, oldCollection, oldObjectId, oldId = null }) {
  const MigrationMap = getMigrationMapModel(connection);
  const query = { entityType, oldCollection, status: { $in: ['mapped', 'merged'] } };

  if (oldObjectId) query.oldObjectId = oldObjectId;
  if (oldId !== null && oldId !== undefined) query.oldId = oldId;

  return MigrationMap.findOne(query).exec();
}

function buildMapUpsertQuery(payload) {
  const query = {
    entityType: payload.entityType,
    oldCollection: payload.oldCollection,
    oldObjectId: payload.oldObjectId || null,
  };

  if (payload.oldId !== null && payload.oldId !== undefined) {
    query.oldId = payload.oldId;
  }

  return query;
}

async function upsertMap(connection, payload) {
  const MigrationMap = getMigrationMapModel(connection);
  const query = buildMapUpsertQuery(payload);

  return MigrationMap.findOneAndUpdate(
    query,
    { $set: payload },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).exec();
}

async function createMap(connection, payload) {
  const MigrationMap = getMigrationMapModel(connection);
  const docs = await MigrationMap.create([payload]);
  return docs[0];
}

async function countByRun(connection, runId, { entityType = null } = {}) {
  const MigrationMap = getMigrationMapModel(connection);
  const query = { runId };
  if (entityType) query.entityType = entityType;
  return MigrationMap.countDocuments(query).exec();
}

module.exports = {
  findMappedByOldRef,
  buildMapUpsertQuery,
  upsertMap,
  createMap,
  countByRun,
};
