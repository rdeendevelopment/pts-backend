const crypto = require('crypto');
const { Types } = require('mongoose');
const { connectSourceDb, connectTargetForSeed } = require('./dualConnection.helper');
const { ensureMigrationIndexes } = require('../models');
const migrationErrorRepository = require('../repositories/migrationError.repository');
const migrationMapRepository = require('../repositories/migrationMap.repository');
const { createMigrationRun, completeMigrationRun } = require('../services/migrationRun.service');
const { writeMigrationReport } = require('./reportWriter.helper');

const TRANSFORM_VERSION = '1.0.0';

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildSourceHash(doc, oldCollection) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      collection: oldCollection,
      legacyId: doc.legacyId ?? null,
      objectId: doc._id ? String(doc._id) : null,
      updatedAt: doc.updatedAt || null,
    }))
    .digest('hex');
}

function normalizeName(value, fallback = 'Unknown') {
  const name = String(value || '').trim();
  return name || fallback;
}

function buildNormalizedName(value) {
  return normalizeName(value).toLowerCase();
}

function createMapCache() {
  return new Map();
}

function mapCacheKey({ entityType, oldCollection, oldObjectId, oldId }) {
  return [
    entityType,
    oldCollection,
    oldObjectId ? String(oldObjectId) : '',
    oldId ?? '',
  ].join(':');
}

async function resolveMappedId(targetConnection, cache, {
  entityType,
  oldCollection,
  oldObjectId = null,
  oldId = null,
}) {
  const key = mapCacheKey({ entityType, oldCollection, oldObjectId, oldId });
  if (cache.has(key)) return cache.get(key);

  const map = await migrationMapRepository.findMappedByOldRef(targetConnection, {
    entityType,
    oldCollection,
    oldObjectId,
    oldId,
  });

  const resolved = map?.newObjectId || null;
  cache.set(key, resolved);
  return resolved;
}

async function findExistingMap(targetConnection, params) {
  return migrationMapRepository.findMappedByOldRef(targetConnection, params);
}

async function saveEntityMap(targetConnection, {
  runId,
  entityType,
  oldCollection,
  oldObjectId,
  oldId,
  newObjectId,
  status = 'mapped',
  metadata = {},
}) {
  return migrationMapRepository.upsertMap(targetConnection, {
    runId,
    entityType,
    oldCollection,
    oldId: oldId ?? null,
    oldObjectId: oldObjectId || null,
    newObjectId,
    status,
    migratedAt: new Date(),
    metadata: {
      transformVersion: TRANSFORM_VERSION,
      ...metadata,
    },
  });
}

async function recordMigrationError(targetConnection, {
  runId,
  entityType,
  oldCollection,
  oldObjectId,
  oldId,
  code,
  message,
  dryRun,
  sourceSnapshot = null,
}) {
  if (dryRun) return null;

  return migrationErrorRepository.createError(targetConnection, {
    runId,
    entityType,
    oldCollection,
    oldId: oldId ?? null,
    oldObjectId: oldObjectId || null,
    status: 'error',
    error: { code, message, details: null },
    sourceSnapshot,
  });
}

async function prepareMigrationContext({
  mode = 'dry-run',
  batchSize = 500,
  startedBy = 'migration',
  notes = null,
  runId = null,
}) {
  if (!['dry-run', 'live', 'resume'].includes(mode)) {
    throw new Error(`Unsupported migration mode "${mode}".`);
  }

  const targetConnection = await connectTargetForSeed();
  const sourceConnection = await connectSourceDb();
  await ensureMigrationIndexes(targetConnection);

  const dryRun = mode === 'dry-run';
  const resume = mode === 'resume';
  const mapCache = createMapCache();

  let run = { _id: runId ? new Types.ObjectId(String(runId)) : new Types.ObjectId() };
  if (!dryRun && !runId) {
    run = await createMigrationRun(targetConnection, {
      mode,
      startedBy,
      notes,
      options: { batchSize },
    });
  } else if (!dryRun && runId) {
    run = { _id: new Types.ObjectId(String(runId)) };
  }

  return {
    mode,
    dryRun,
    resume,
    batchSize,
    sourceConnection,
    targetConnection,
    run,
    mapCache,
  };
}

async function finalizeMigrationStep(targetConnection, run, stepName, stats, { dryRun, mode, batchSize }) {
  const report = {
    runId: String(run._id),
    mode,
    batchSize,
    transformVersion: TRANSFORM_VERSION,
    completedAt: new Date().toISOString(),
    ...stats,
  };

  const reportPath = await writeMigrationReport(run._id, stepName, report);
  return { report, reportPath };
}

module.exports = {
  TRANSFORM_VERSION,
  chunkArray,
  buildSourceHash,
  normalizeName,
  buildNormalizedName,
  createMapCache,
  resolveMappedId,
  findExistingMap,
  saveEntityMap,
  recordMigrationError,
  prepareMigrationContext,
  finalizeMigrationStep,
  completeMigrationRun,
};
