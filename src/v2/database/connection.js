const mongoose = require('mongoose');
const { MONGO_URI, MONGO_V2_DB } = require('../../../config/constants');
const { info } = require('../kernel/logger');

let v2Connection = null;
let v2ConnectionPromise = null;

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

async function connectV2Database() {
  if (v2Connection?.readyState === 1) {
    return v2Connection;
  }

  if (v2ConnectionPromise) {
    return v2ConnectionPromise;
  }

  if (!MONGO_URI) {
    throw new Error('MONGO_URI is not configured.');
  }

  if (!MONGO_V2_DB) {
    throw new Error(
      'MONGO_V2_DB is required for v2 API runtime. '
      + 'Set env MONGO_V2_DB or mongodb.v2Db in config.yaml (e.g. rdn_pts_dev_v2).'
    );
  }

  v2ConnectionPromise = (async () => {
    v2Connection = mongoose.createConnection(MONGO_URI, buildConnectionOptions(MONGO_V2_DB));
    await v2Connection.asPromise();
    info('PTS v2 database connected', { database: MONGO_V2_DB });
    return v2Connection;
  })().catch((err) => {
    v2ConnectionPromise = null;
    throw err;
  });

  return v2ConnectionPromise;
}

function getV2Connection() {
  if (!v2Connection || v2Connection.readyState !== 1) {
    throw new Error('V2 database is not connected. Ensure v2 bootstrap completed successfully.');
  }
  return v2Connection;
}

function getV2Model(name, schema) {
  const conn = getV2Connection();
  return conn.models[name] || conn.model(name, schema);
}

function getV2MongoStatus() {
  return {
    ready: v2Connection?.readyState === 1,
    readyState: v2Connection?.readyState ?? 0,
    name: v2Connection?.name || MONGO_V2_DB || null,
  };
}

async function closeV2Database() {
  if (!v2Connection) {
    v2ConnectionPromise = null;
    return;
  }

  await v2Connection.close().catch(() => {});
  v2Connection = null;
  v2ConnectionPromise = null;
}

module.exports = {
  connectV2Database,
  getV2Connection,
  getV2Model,
  getV2MongoStatus,
  closeV2Database,
};
