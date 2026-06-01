const migrationMapRepository = require('../repositories/migrationMap.repository');

async function findExistingAccountMap(targetConnection, sourceRow) {
  return migrationMapRepository.findMappedByOldRef(targetConnection, {
    entityType: 'account',
    oldCollection: sourceRow.sourceCollection,
    oldObjectId: sourceRow.oldObjectId,
    oldId: sourceRow.legacyId,
  });
}

async function saveAccountMap(targetConnection, {
  runId,
  sourceRow,
  newObjectId,
  status = 'mapped',
  metadata = {},
}) {
  return migrationMapRepository.upsertMap(targetConnection, {
    runId,
    entityType: 'account',
    oldCollection: sourceRow.sourceCollection,
    oldId: sourceRow.legacyId,
    oldObjectId: sourceRow.oldObjectId,
    newObjectId,
    status,
    migratedAt: new Date(),
    metadata,
  });
}

async function saveUserMap(targetConnection, {
  runId,
  sourceRow,
  newObjectId,
  status = 'mapped',
  metadata = {},
}) {
  return migrationMapRepository.upsertMap(targetConnection, {
    runId,
    entityType: 'user',
    oldCollection: sourceRow.sourceCollection,
    oldId: sourceRow.legacyId,
    oldObjectId: sourceRow.oldObjectId,
    newObjectId,
    status,
    migratedAt: new Date(),
    metadata,
  });
}

module.exports = {
  findExistingAccountMap,
  saveAccountMap,
  saveUserMap,
};
