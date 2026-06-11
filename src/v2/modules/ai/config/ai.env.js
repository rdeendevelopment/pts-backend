const nodeEnv = String(process.env.NODE_ENV || 'development').toLowerCase();

let appConstants = {};
try {
  appConstants = require('../../../../../config/constants');
} catch (_err) {
  appConstants = {};
}

function parseBool(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function pickConfigOrEnv(envValue, configValue, defaultValue) {
  if (envValue != null && envValue !== '') return envValue;
  if (configValue != null && configValue !== '') return configValue;
  return defaultValue;
}

module.exports = {
  enabled: parseBool(
    pickConfigOrEnv(process.env.PTS_AI_ENABLED, appConstants.AI_ENABLED, true),
    true
  ),
  debugEnabled: parseBool(
    pickConfigOrEnv(process.env.PTS_AI_DEBUG_ENABLED, appConstants.AI_DEBUG_ENABLED, nodeEnv === 'development'),
    nodeEnv === 'development'
  ),
  openai: {
    apiKey: pickConfigOrEnv(
      process.env.OPENAI_API_KEY || process.env.PTS_OPENAI_API_KEY,
      appConstants.OPENAI_API_KEY,
      ''
    ),
    organization: pickConfigOrEnv(process.env.OPENAI_ORG_ID, appConstants.OPENAI_ORG_ID, ''),
    baseUrl: pickConfigOrEnv(process.env.OPENAI_BASE_URL, appConstants.OPENAI_BASE_URL, 'https://api.openai.com/v1'),
    defaultMaxOutputTokens: parseNumber(
      pickConfigOrEnv(process.env.PTS_AI_MAX_OUTPUT_TOKENS, appConstants.PTS_AI_MAX_OUTPUT_TOKENS, 2048),
      2048
    ),
  },
  langsmith: {
    enabled: parseBool(
      pickConfigOrEnv(process.env.PTS_LANGSMITH_ENABLED, appConstants.PTS_LANGSMITH_ENABLED, false),
      false
    ),
    apiKey: pickConfigOrEnv(
      process.env.LANGCHAIN_API_KEY || process.env.PTS_LANGSMITH_API_KEY,
      appConstants.LANGCHAIN_API_KEY,
      ''
    ),
    project: pickConfigOrEnv(
      process.env.LANGCHAIN_PROJECT || process.env.PTS_LANGSMITH_PROJECT,
      appConstants.LANGCHAIN_PROJECT,
      'pts-v2'
    ),
    endpoint: pickConfigOrEnv(
      process.env.LANGCHAIN_ENDPOINT,
      appConstants.LANGCHAIN_ENDPOINT,
      'https://api.smith.langchain.com'
    ),
  },
  wallet: {
    defaultTenantBalance: parseNumber(
      pickConfigOrEnv(process.env.PTS_AI_DEFAULT_WALLET_TOKENS, appConstants.PTS_AI_DEFAULT_WALLET_TOKENS, 500_000),
      500_000
    ),
    reserveBufferRatio: parseNumber(
      pickConfigOrEnv(process.env.PTS_AI_RESERVE_BUFFER_RATIO, appConstants.PTS_AI_RESERVE_BUFFER_RATIO, 1.2),
      1.2
    ),
  },
  worker: {
    pollIntervalMs: parseNumber(
      pickConfigOrEnv(process.env.PTS_AI_WORKER_POLL_MS, appConstants.PTS_AI_WORKER_POLL_MS, 2000),
      2000
    ),
    maxConcurrentJobs: parseNumber(
      pickConfigOrEnv(process.env.PTS_AI_WORKER_MAX_CONCURRENT, appConstants.PTS_AI_WORKER_MAX_CONCURRENT, 3),
      3
    ),
  },
};
