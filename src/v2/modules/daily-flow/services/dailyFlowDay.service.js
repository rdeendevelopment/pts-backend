const { AppError } = require('../../../kernel/errors');
const { info } = require('../../../kernel/logger');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const {
  MOOD_PERIODS,
  MOOD_ENERGY_MIN,
  MOOD_ENERGY_MAX,
} = require('../constants/dailyFlow.constants');
const dayRepository = require('../repositories/dailyFlowDay.repository');
const { toDayDto } = require('../dto/dailyFlow.dto');
const { assertValidDayKey, isWeekendDayKey } = require('../helpers/dayKey.helper');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const { pickNumber, pickString } = require('../helpers/payload.helper');
const settingsService = require('./dailyFlowSettings.service');
const { formatDayKey, getBusinessTimezone } = require('../../activity/helpers/week.helper');

async function assertWeekendAllowed(accountId, dayKey) {
  const settings = await settingsService.getSettingsRecord(accountId);
  const timezone = settings.timezone || getBusinessTimezone();

  if (!settings.weekend_planning_enabled && isWeekendDayKey(dayKey, timezone)) {
    throw new AppError('Weekend planning is disabled for this user', {
      status: 403,
      code: dailyFlowErrorCodes.DAILY_FLOW_WEEKEND_PLANNING_DISABLED,
      details: { day_key: dayKey },
    });
  }
}

async function getOrCreateDay(accountId, dayKeyInput, options = {}) {
  const dayKey = assertValidDayKey(dayKeyInput);
  await assertWeekendAllowed(accountId, dayKey);

  const settings = await settingsService.getSettingsRecord(accountId);
  const timezone = options.timezone || settings.timezone || getBusinessTimezone();
  const userId = await resolveUserIdForAccount(accountId);

  info('Daily Flow getOrCreateDay', { accountId, dayKey });

  const day = await dayRepository.findOrCreateDay(accountId, dayKey, {
    userId,
    timezone,
    status: 'active',
  });

  return day;
}

async function getTodayDayKey(accountId) {
  const settings = await settingsService.getSettingsRecord(accountId);
  const timezone = settings.timezone || getBusinessTimezone();
  return formatDayKey(new Date(), timezone);
}

async function saveMood(accountId, payload = {}) {
  const dayKey = assertValidDayKey(payload.day_key || payload.dayKey);
  const period = String(payload.period || '').toLowerCase();

  if (!MOOD_PERIODS.includes(period)) {
    throw new AppError('Invalid mood period', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_DAY_STATUS,
      fields: { period: `period must be one of: ${MOOD_PERIODS.join(', ')}` },
    });
  }

  const mood = pickNumber(payload, 'mood');
  const energy = pickNumber(payload, 'energy');
  const note = pickString(payload, 'note');

  if (mood !== undefined && (mood < MOOD_ENERGY_MIN || mood > MOOD_ENERGY_MAX)) {
    throw new AppError('Invalid mood value', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_DAY_STATUS,
      fields: { mood: `mood must be between ${MOOD_ENERGY_MIN} and ${MOOD_ENERGY_MAX}` },
    });
  }

  if (energy !== undefined && (energy < MOOD_ENERGY_MIN || energy > MOOD_ENERGY_MAX)) {
    throw new AppError('Invalid energy value', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_DAY_STATUS,
      fields: { energy: `energy must be between ${MOOD_ENERGY_MIN} and ${MOOD_ENERGY_MAX}` },
    });
  }

  const day = await getOrCreateDay(accountId, dayKey);
  const updates = { status: 'active' };

  if (period === 'morning') {
    if (mood !== undefined) updates.moodMorning = mood;
    if (energy !== undefined) updates.energyMorning = energy;
    if (note !== undefined) updates.moodMorningNote = note;
  } else {
    if (mood !== undefined) updates.moodEvening = mood;
    if (energy !== undefined) updates.energyEvening = energy;
    if (note !== undefined) updates.moodEveningNote = note;
  }

  info('Daily Flow saveMood', { accountId, dayKey, period });

  const updated = await dayRepository.updateDayByAccountAndKey(accountId, dayKey, updates);
  return toDayDto(updated || day);
}

module.exports = {
  assertWeekendAllowed,
  getOrCreateDay,
  getTodayDayKey,
  saveMood,
};
