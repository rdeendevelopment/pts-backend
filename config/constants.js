try {
  const path = require('path');
  const yaml = require('node-yaml-config');

  const NODE_ENV = process.env.NODE_ENV || 'development';
  const env = yaml.load(path.join(__dirname, '..', 'config.yaml'), NODE_ENV);

  // App
  const HOST_NAME = env?.app?.hostName ?? 'localhost';
  const APP_PORT  = env?.app?.port ?? 3000;
  const HOST      = env?.app?.hostURL ?? `http://localhost:${APP_PORT}`;
  const APP_ENV   = env?.app?.env ?? NODE_ENV;
  const APP_TITLE = env?.app?.title ?? 'PTS-BACKEND';
  const API_VERSION = env?.app?.version ?? 1.0;
  const TIME_ZONE = env?.app?.timezone ?? 'America/Los_Angeles';
  const TIME_ZONE_OFFSET = env?.app?.timezoneOffset ?? '+0:00';
  const FRONTEND_URL = null;

  // Secrets (allow overriding via env)
  const APP_SECRET = process.env.APP_SECRET || env?.secret?.key || '';
  const EXPIRE_IN  = env?.secret?.expiresIn || '';

  const MONGO_URI   = process.env.MONGO_URI || env?.mongodb?.uri || 'mongodb://127.0.0.1:27017/pts_tasks_dev';
  const MONGO_DB    = process.env.MONGO_DB || env?.mongodb?.db || '';
  module.exports = {
    HOST_NAME, HOST, APP_ENV, APP_TITLE, APP_PORT, API_VERSION,
    FRONTEND_URL, APP_SECRET, EXPIRE_IN, TIME_ZONE, TIME_ZONE_OFFSET,
    MONGO_URI, MONGO_DB,
  };
} catch (error) {
  console.error('error in config constants =>', error);
}
