const { AppError } = require('../../../kernel/errors');
const { DAY_KEY_PATTERN } = require('../constants/dailyFlow.constants');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const {
  formatDayKey,
  getBusinessTimezone,
} = require('../../activity/helpers/week.helper');

function normalizeDayKey(value) {
  return String(value ?? '').trim();
}

function assertValidDayKey(dayKey, field = 'day_key') {
  const normalized = normalizeDayKey(dayKey);

  if (!DAY_KEY_PATTERN.test(normalized)) {
    throw new AppError('Invalid day key', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_DAY_KEY,
      fields: { [field]: 'day_key must be YYYY-MM-DD' },
    });
  }

  return normalized;
}

function resolveDayKeyFromInput(value, timezone = getBusinessTimezone()) {
  if (!value) return null;

  const normalized = normalizeDayKey(value);
  if (DAY_KEY_PATTERN.test(normalized)) {
    return normalized;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid day key', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_DAY_KEY,
      fields: { day_key: 'day_key must be YYYY-MM-DD or a valid date' },
    });
  }

  return formatDayKey(date, timezone);
}

function isWeekendDayKey(dayKey, timezone = getBusinessTimezone()) {
  const normalized = assertValidDayKey(dayKey);
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date);

  return weekday === 'Sat' || weekday === 'Sun';
}

module.exports = {
  normalizeDayKey,
  assertValidDayKey,
  resolveDayKeyFromInput,
  isWeekendDayKey,
};
