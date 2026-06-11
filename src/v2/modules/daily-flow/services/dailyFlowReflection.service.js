const { info } = require('../../../kernel/logger');
const { AppError } = require('../../../kernel/errors');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const {
  MOOD_ENERGY_MIN,
  MOOD_ENERGY_MAX,
} = require('../constants/dailyFlow.constants');
const reflectionRepository = require('../repositories/dailyFlowReflection.repository');
const { toReflectionDto } = require('../dto/dailyFlow.dto');
const { assertValidDayKey } = require('../helpers/dayKey.helper');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const { pickString, pickNumber, pickField } = require('../helpers/payload.helper');
const dayService = require('./dailyFlowDay.service');

async function getReflection(accountId, dayKeyInput) {
  const dayKey = assertValidDayKey(dayKeyInput);
  const reflection = await reflectionRepository.findReflectionByAccountAndDayKey(accountId, dayKey);

  if (!reflection) {
    throw new AppError('Daily Flow reflection not found', {
      status: 404,
      code: dailyFlowErrorCodes.DAILY_FLOW_REFLECTION_NOT_FOUND,
    });
  }

  return toReflectionDto(reflection);
}

async function saveReflection(accountId, payload = {}) {
  const dayKey = assertValidDayKey(payload.day_key || payload.dayKey);
  const userId = await resolveUserIdForAccount(accountId);
  const day = await dayService.getOrCreateDay(accountId, dayKey);

  const mood = pickNumber(payload, 'mood');
  const energy = pickNumber(payload, 'energy');

  if (mood !== undefined && (mood < MOOD_ENERGY_MIN || mood > MOOD_ENERGY_MAX)) {
    throw new AppError('Invalid reflection mood value', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_DAY_STATUS,
      fields: { mood: `mood must be between ${MOOD_ENERGY_MIN} and ${MOOD_ENERGY_MAX}` },
    });
  }

  if (energy !== undefined && (energy < MOOD_ENERGY_MIN || energy > MOOD_ENERGY_MAX)) {
    throw new AppError('Invalid reflection energy value', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_DAY_STATUS,
      fields: { energy: `energy must be between ${MOOD_ENERGY_MIN} and ${MOOD_ENERGY_MAX}` },
    });
  }

  const updates = {
    accountId,
    userId,
    dayId: day._id,
    dayKey,
  };

  const fields = [
    ['biggestWin', 'biggest_win'],
    ['blockers', 'blockers'],
    ['learnings', 'learnings'],
    ['tomorrowPlan', 'tomorrow_plan'],
  ];

  for (const [camel, snake] of fields) {
    const value = pickField(payload, camel, snake);
    if (value !== undefined) updates[camel] = pickString(payload, camel, snake);
  }

  if (mood !== undefined) updates.mood = mood;
  if (energy !== undefined) updates.energy = energy;

  info('Daily Flow reflection saved', { accountId, dayKey });

  const reflection = await reflectionRepository.upsertReflection(accountId, dayKey, updates);
  return toReflectionDto(reflection);
}

module.exports = {
  getReflection,
  saveReflection,
};
