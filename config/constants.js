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
  const MONGO_V2_DB = process.env.MONGO_V2_DB || env?.mongodb?.v2Db || '';

  const AI_ENABLED = process.env.PTS_AI_ENABLED != null
    ? String(process.env.PTS_AI_ENABLED).toLowerCase() === 'true'
    : env?.ai?.enabled !== false;
  const AI_DEBUG_ENABLED = process.env.PTS_AI_DEBUG_ENABLED != null
    ? String(process.env.PTS_AI_DEBUG_ENABLED).toLowerCase() === 'true'
    : env?.ai?.debugEnabled !== false;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    || process.env.PTS_OPENAI_API_KEY
    || env?.ai?.openai?.apiKey
    || '';
  const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID || env?.ai?.openai?.organization || '';
  const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || env?.ai?.openai?.baseUrl || 'https://api.openai.com/v1';
  const PTS_AI_MAX_OUTPUT_TOKENS = Number(
    process.env.PTS_AI_MAX_OUTPUT_TOKENS || env?.ai?.openai?.maxOutputTokens || 2048
  );
  const PTS_AI_DEFAULT_WALLET_TOKENS = Number(
    process.env.PTS_AI_DEFAULT_WALLET_TOKENS || env?.ai?.wallet?.defaultTenantBalance || 500_000
  );
  const PTS_AI_RESERVE_BUFFER_RATIO = Number(
    process.env.PTS_AI_RESERVE_BUFFER_RATIO || env?.ai?.wallet?.reserveBufferRatio || 1.2
  );
  const PTS_AI_WORKER_POLL_MS = Number(
    process.env.PTS_AI_WORKER_POLL_MS || env?.ai?.worker?.pollIntervalMs || 2000
  );
  const PTS_AI_WORKER_MAX_CONCURRENT = Number(
    process.env.PTS_AI_WORKER_MAX_CONCURRENT || env?.ai?.worker?.maxConcurrentJobs || 3
  );
  const PTS_LANGSMITH_ENABLED = process.env.PTS_LANGSMITH_ENABLED != null
    ? String(process.env.PTS_LANGSMITH_ENABLED).toLowerCase() === 'true'
    : Boolean(env?.ai?.langsmith?.enabled);
  const LANGCHAIN_API_KEY = process.env.LANGCHAIN_API_KEY
    || process.env.PTS_LANGSMITH_API_KEY
    || env?.ai?.langsmith?.apiKey
    || '';
  const LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT
    || process.env.PTS_LANGSMITH_PROJECT
    || env?.ai?.langsmith?.project
    || 'pts-v2';
  const LANGCHAIN_ENDPOINT = process.env.LANGCHAIN_ENDPOINT
    || env?.ai?.langsmith?.endpoint
    || 'https://api.smith.langchain.com';

  module.exports = {
    HOST_NAME, HOST, APP_ENV, APP_TITLE, APP_PORT, API_VERSION,
    FRONTEND_URL, APP_SECRET, EXPIRE_IN, TIME_ZONE, TIME_ZONE_OFFSET,
    MONGO_URI, MONGO_DB, MONGO_V2_DB,
    AI_ENABLED,
    AI_DEBUG_ENABLED,
    OPENAI_API_KEY,
    OPENAI_ORG_ID,
    OPENAI_BASE_URL,
    PTS_AI_MAX_OUTPUT_TOKENS,
    PTS_AI_DEFAULT_WALLET_TOKENS,
    PTS_AI_RESERVE_BUFFER_RATIO,
    PTS_AI_WORKER_POLL_MS,
    PTS_AI_WORKER_MAX_CONCURRENT,
    PTS_LANGSMITH_ENABLED,
    LANGCHAIN_API_KEY,
    LANGCHAIN_PROJECT,
    LANGCHAIN_ENDPOINT,
  };
} catch (error) {
  console.error('error in config constants =>', error);
}
