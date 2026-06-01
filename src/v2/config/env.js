const SUPPORTED_ENVIRONMENTS = ['development', 'staging', 'production'];
const { WEEK_START_DAYS } = require('../modules/activity/constants/activity.constants');

function resolveEnvironment() {
  const raw = String(process.env.NODE_ENV || 'development').toLowerCase();
  return SUPPORTED_ENVIRONMENTS.includes(raw) ? raw : 'development';
}

function resolveWeekStartDay() {
  const normalized = String(process.env.PTS_V2_WEEK_START_DAY || 'monday').toLowerCase();
  return WEEK_START_DAYS.includes(normalized) ? normalized : 'monday';
}

const nodeEnv = resolveEnvironment();

module.exports = {
  nodeEnv,
  isDevelopment: nodeEnv === 'development',
  isStaging: nodeEnv === 'staging',
  isProduction: nodeEnv === 'production',
  supportedEnvironments: SUPPORTED_ENVIRONMENTS,
  v2: {
    enabled: process.env.PTS_V2_ENABLED !== 'false',
    apiPrefix: '/api/v2',
    logLevel: process.env.PTS_V2_LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug'),
    businessTimezone: process.env.PTS_V2_BUSINESS_TIMEZONE || 'UTC',
    weekStartDay: resolveWeekStartDay(),
    maxTimerMinutes: Number(process.env.PTS_V2_MAX_TIMER_MINUTES || 960),
    retainerAutoRenewal: {
      enabled: process.env.PTS_V2_RETAINER_AUTO_RENEWAL !== 'false',
      cronExpression: process.env.PTS_V2_RETAINER_RENEWAL_CRON || '5 0 * * *',
    },
    agenda: {
      enabled: process.env.PTS_V2_AGENDA_ENABLED !== 'false',
      processEvery: process.env.PTS_V2_AGENDA_PROCESS_EVERY || '30 seconds',
      maxConcurrency: Number(process.env.PTS_V2_AGENDA_MAX_CONCURRENCY || 5),
    },
    agendash: {
      enabled: process.env.PTS_AGENDASH_ENABLED !== 'false',
      path: process.env.PTS_AGENDASH_PATH || '/agendash',
      username: process.env.PTS_AGENDASH_USER || 'admin',
      password: process.env.PTS_AGENDASH_PASSWORD
        || (nodeEnv === 'production' ? '' : 'admin'),
    },
  },
};
