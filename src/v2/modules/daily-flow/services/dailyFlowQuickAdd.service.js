const { AppError } = require('../../../kernel/errors');
const { info } = require('../../../kernel/logger');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const { QUICK_ADD_TYPES } = require('../constants/dailyFlow.constants');
const goalService = require('./dailyFlowGoal.service');
const catchupService = require('./dailyFlowCatchup.service');
const dayService = require('./dailyFlowDay.service');
const { assertValidDayKey } = require('../helpers/dayKey.helper');
const { pickString } = require('../helpers/payload.helper');

async function quickAdd(accountId, payload = {}) {
  const text = pickString(payload, 'text');
  if (!text) {
    throw new AppError('text is required', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_QUICK_ADD_TYPE,
      fields: { text: 'text is required' },
    });
  }

  const type = String(payload.type || '').toLowerCase();
  if (!QUICK_ADD_TYPES.includes(type)) {
    throw new AppError('Invalid quick-add type', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_QUICK_ADD_TYPE,
      details: { allowed: QUICK_ADD_TYPES },
    });
  }

  const dayKey = payload.day_key || payload.dayKey
    ? assertValidDayKey(payload.day_key || payload.dayKey)
    : await dayService.getTodayDayKey(accountId);

  info('Daily Flow quickAdd', { accountId, type, dayKey });

  if (type === 'work_goal') {
    return goalService.createGoal(accountId, {
      title: text,
      goal_type: 'work',
      day_key: dayKey,
      target_value: 1,
      current_value: 0,
      unit: 'goal',
      status: 'in_progress',
    });
  }

  if (type === 'personal_goal') {
    return goalService.createGoal(accountId, {
      title: text,
      goal_type: 'personal',
      day_key: dayKey,
      target_value: 1,
      current_value: 0,
      unit: 'goal',
      status: 'in_progress',
    });
  }

  const catchupType = type === 'reminder' ? 'reminder' : 'need_to_discuss';
  return catchupService.createCatchup(accountId, {
    day_key: dayKey,
    type: catchupType,
    title: text,
  });
}

module.exports = {
  quickAdd,
};
