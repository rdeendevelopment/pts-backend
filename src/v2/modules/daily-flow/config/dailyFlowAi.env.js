function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseBool(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

module.exports = {
  model: process.env.DAILY_FLOW_AI_MODEL || 'gpt-4o-mini',
  timeoutMs: parseNumber(process.env.DAILY_FLOW_AI_TIMEOUT_MS, 15000),
  maxWelcomeWords: parseNumber(process.env.DAILY_FLOW_AI_MAX_WELCOME_WORDS, 80),
  maxEndSummaryWords: parseNumber(process.env.DAILY_FLOW_AI_MAX_END_SUMMARY_WORDS, 120),
  enabled: parseBool(process.env.DAILY_FLOW_AI_ENABLED, true),
};
