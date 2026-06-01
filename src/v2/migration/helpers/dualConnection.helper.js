const mongoose = require('mongoose');
const { MONGO_URI, MONGO_DB, MONGO_V2_DB } = require('../../../../config/constants');
const { connectV2Database, closeV2Database } = require('../../database/connection');

let sourceConnection = null;
let targetConnection = null;

function assertMongoUri() {
  if (!MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }
}

function buildConnectionOptions(dbName) {
  return {
    dbName,
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
    connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10000),
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20),
    minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 1),
    retryWrites: process.env.MONGO_RETRY_WRITES === 'false' ? false : true,
    family: 4,
  };
}

function assertSourceDbName() {
  if (!MONGO_DB) {
    throw new Error('MONGO_DB is required for legacy/source connection.');
  }
  return MONGO_DB;
}

function assertTargetDbName() {
  if (!MONGO_V2_DB) {
    throw new Error(
      'MONGO_V2_DB is required for v2 target connection. '
      + 'Set env MONGO_V2_DB or mongodb.v2Db in config.yaml (see docs/v2-seed.md).'
    );
  }
  if (MONGO_DB && MONGO_V2_DB === MONGO_DB) {
    throw new Error(
      `MONGO_V2_DB must differ from MONGO_DB (both are "${MONGO_V2_DB}"). `
      + 'Set mongodb.v2Db in config.yaml to a separate database, e.g. rdn_pts_dev_v2.'
    );
  }
  return MONGO_V2_DB;
}

async function connectSourceDb() {
  assertMongoUri();
  const dbName = assertSourceDbName();

  if (sourceConnection?.readyState === 1) {
    return sourceConnection;
  }

  sourceConnection = mongoose.createConnection(MONGO_URI, buildConnectionOptions(dbName));
  await sourceConnection.asPromise();
  return sourceConnection;
}

async function connectTargetDb() {
  assertMongoUri();
  const dbName = assertTargetDbName();

  if (targetConnection?.readyState === 1) {
    return targetConnection;
  }

  targetConnection = mongoose.createConnection(MONGO_URI, buildConnectionOptions(dbName));
  await targetConnection.asPromise();
  return targetConnection;
}

/**
 * CLI entry (seed + migration) — same v2 connection as runtime API.
 */
async function connectTargetForSeed() {
  return connectV2Database();
}

function getSourceConnection() {
  return sourceConnection;
}

function getTargetConnection() {
  return targetConnection;
}

async function closeMigrationConnections() {
  const closes = [];

  if (sourceConnection) {
    closes.push(sourceConnection.close().catch(() => {}));
    sourceConnection = null;
  }

  if (targetConnection) {
    closes.push(targetConnection.close().catch(() => {}));
    targetConnection = null;
  }

  closes.push(closeV2Database().catch(() => {}));

  await Promise.all(closes);
}

module.exports = {
  connectSourceDb,
  connectTargetDb,
  connectTargetForSeed,
  getSourceConnection,
  getTargetConnection,
  closeMigrationConnections,
};
