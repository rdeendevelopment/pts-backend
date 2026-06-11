const {
  DEFAULT_DASHBOARD_GOALS_LIMIT,
  DEFAULT_DASHBOARD_CATCHUPS_LIMIT,
  MAX_DASHBOARD_LIMIT,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
} = require('../constants/dailyFlow.constants');

function clampLimit(value, { defaultLimit, maxLimit }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultLimit;
  return Math.min(Math.floor(parsed), maxLimit);
}

function parseDashboardGoalsLimit(value) {
  return clampLimit(value, {
    defaultLimit: DEFAULT_DASHBOARD_GOALS_LIMIT,
    maxLimit: MAX_DASHBOARD_LIMIT,
  });
}

function parseDashboardCatchupsLimit(value) {
  return clampLimit(value, {
    defaultLimit: DEFAULT_DASHBOARD_CATCHUPS_LIMIT,
    maxLimit: MAX_DASHBOARD_LIMIT,
  });
}

function parseListLimit(value, defaultLimit = DEFAULT_LIST_LIMIT, maxLimit = MAX_LIST_LIMIT) {
  return clampLimit(value, { defaultLimit, maxLimit });
}

module.exports = {
  clampLimit,
  parseDashboardGoalsLimit,
  parseDashboardCatchupsLimit,
  parseListLimit,
};
