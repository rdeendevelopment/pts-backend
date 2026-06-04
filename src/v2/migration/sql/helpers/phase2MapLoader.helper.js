const { getMigrationMapModel } = require('../../models/migrationMap.model');

function mapKey(entityType, oldCollection, oldId) {
  return `${entityType}:${oldCollection}:${oldId}`;
}

/**
 * Load Phase 1 (and prior) entity maps. Latest migratedAt wins per key.
 */
async function loadPhase1MapCache(connection) {
  const MigrationMap = getMigrationMapModel(connection);
  const maps = await MigrationMap.find({
    entityType: { $in: ['user', 'project', 'work_category', 'budget'] },
    status: { $in: ['mapped', 'merged', 'skipped'] },
  })
    .sort({ migratedAt: -1, createdAt: -1 })
    .lean();

  const cache = new Map();
  for (const row of maps) {
    if (row.oldId === null || row.oldId === undefined) continue;
    const key = mapKey(row.entityType, row.oldCollection, row.oldId);
    if (!cache.has(key)) cache.set(key, row.newObjectId);
  }
  return cache;
}

async function loadPhase2EntryMapCache(connection) {
  const MigrationMap = getMigrationMapModel(connection);
  const maps = await MigrationMap.find({
    entityType: 'time_entry',
    oldCollection: 'working_hours',
    status: { $in: ['mapped', 'merged'] },
  })
    .sort({ migratedAt: -1 })
    .lean();

  const byOldId = new Map();
  for (const row of maps) {
    if (row.oldId === null || row.oldId === undefined) continue;
    if (!byOldId.has(row.oldId)) byOldId.set(row.oldId, row);
  }
  return byOldId;
}

async function loadPhase2WeekMapCache(connection) {
  const MigrationMap = getMigrationMapModel(connection);
  const maps = await MigrationMap.find({
    entityType: 'time_week',
    oldCollection: 'sql_week',
    status: { $in: ['mapped', 'merged'] },
  })
    .sort({ migratedAt: -1 })
    .lean();

  const byOldId = new Map();
  for (const row of maps) {
    if (row.oldId === null || row.oldId === undefined) continue;
    if (!byOldId.has(row.oldId)) byOldId.set(row.oldId, row.newObjectId);
  }
  return byOldId;
}

function resolveMapId(cache, entityType, oldCollection, oldId) {
  if (oldId === null || oldId === undefined) return null;
  return cache.get(mapKey(entityType, oldCollection, oldId)) || null;
}

module.exports = {
  mapKey,
  loadPhase1MapCache,
  loadPhase2EntryMapCache,
  loadPhase2WeekMapCache,
  resolveMapId,
};
