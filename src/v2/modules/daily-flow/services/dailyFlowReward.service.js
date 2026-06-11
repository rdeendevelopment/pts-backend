const { AppError } = require('../../../kernel/errors');
const { info } = require('../../../kernel/logger');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const {
  HEALTHY_HABIT_CATEGORIES,
} = require('../constants/dailyFlow.constants');
const rewardRepository = require('../repositories/dailyFlowReward.repository');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const dayRepository = require('../repositories/dailyFlowDay.repository');
const { toRewardDto } = require('../dto/dailyFlow.dto');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const { isWeekendDayKey } = require('../helpers/dayKey.helper');
const dayService = require('./dailyFlowDay.service');
const settingsService = require('./dailyFlowSettings.service');
const { formatDayKey, getBusinessTimezone } = require('../../activity/helpers/week.helper');

const RULE_DEFINITIONS = {
  '3_day_consistency': {
    type: 'consistency',
    label: '3 Day Consistency',
    description: 'Active daily flow engagement for 3 consecutive days.',
    streakDays: 3,
  },
  '5_day_consistency': {
    type: 'consistency',
    label: '5 Day Consistency',
    description: 'Active daily flow engagement for 5 consecutive days.',
    streakDays: 5,
  },
  completed_all_planned_goals: {
    type: 'goal_completion',
    label: 'All Planned Goals Completed',
    description: 'Completed all planned goals for the day.',
  },
  weekend_effort: {
    type: 'team_support',
    label: 'Weekend Effort',
    description: 'Showed up and planned on a weekend day.',
  },
  healthy_habit_completed: {
    type: 'healthy_habit',
    label: 'Healthy Habit Completed',
    description: 'Completed a healthy habit personal goal.',
  },
};

function shiftDayKey(dayKey, offsetDays) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function hasDayEngagement(accountId, dayKey) {
  const [day, goals, rewards] = await Promise.all([
    dayRepository.findDayByAccountAndKey(accountId, dayKey),
    goalRepository.countGoals({ accountId, dayKey, excludeDeletedStatus: true }),
    rewardRepository.countRewards({ accountId, dayKey }),
  ]);

  if (!day) return false;

  const hasMood = day.moodMorning != null
    || day.moodEvening != null
    || day.energyMorning != null
    || day.energyEvening != null;

  return goals > 0 || hasMood || rewards > 0;
}

async function hasConsistencyStreak(accountId, dayKey, streakDays) {
  for (let offset = 0; offset < streakDays; offset += 1) {
    const key = shiftDayKey(dayKey, -offset);
    const engaged = await hasDayEngagement(accountId, key);
    if (!engaged) return false;
  }
  return true;
}

async function hasCompletedAllPlannedGoals(accountId, dayKey) {
  const { items } = await goalRepository.listGoals(
    { accountId, dayKey, excludeDeletedStatus: true },
    { limit: 200, skip: 0 }
  );

  if (!items.length) return false;
  return items.every((goal) => goal.status === 'completed');
}

async function hasHealthyHabitCompleted(accountId, dayKey) {
  const { items } = await goalRepository.listGoals(
    { accountId, dayKey, type: 'personal', excludeDeletedStatus: true },
    { limit: 200, skip: 0 }
  );

  return items.some((goal) => {
    const category = String(goal.category || '').toLowerCase();
    return goal.status === 'completed'
      && HEALTHY_HABIT_CATEGORIES.some((value) => category.includes(value));
  });
}

async function evaluateRule(accountId, dayKey, ruleKey, definition, context = {}) {
  const existing = await rewardRepository.findRewardByRule(accountId, dayKey, ruleKey);
  if (existing) {
    return { created: false, reward: toRewardDto(existing) };
  }

  let eligible = false;

  if (definition.streakDays) {
    eligible = await hasConsistencyStreak(accountId, dayKey, definition.streakDays);
  } else if (ruleKey === 'completed_all_planned_goals') {
    eligible = await hasCompletedAllPlannedGoals(accountId, dayKey);
  } else if (ruleKey === 'weekend_effort') {
    eligible = isWeekendDayKey(dayKey, context.timezone)
      && await hasDayEngagement(accountId, dayKey);
  } else if (ruleKey === 'healthy_habit_completed') {
    eligible = await hasHealthyHabitCompleted(accountId, dayKey);
  }

  if (!eligible) {
    return { created: false, reward: null };
  }

  try {
    const reward = await rewardRepository.createReward({
      accountId,
      userId: context.userId,
      dayId: context.dayId || null,
      dayKey,
      type: definition.type,
      ruleKey,
      label: definition.label,
      description: definition.description,
      status: 'earned',
      earnedAt: new Date(),
    });

    info('Daily Flow reward created', { accountId, dayKey, ruleKey });
    return { created: true, reward: toRewardDto(reward) };
  } catch (err) {
    if (err?.code === 11000) {
      const duplicate = await rewardRepository.findRewardByRule(accountId, dayKey, ruleKey);
      return { created: false, reward: toRewardDto(duplicate) };
    }
    throw err;
  }
}

async function listRewards(accountId, query = {}) {
  const { items, total } = await rewardRepository.listRewards(
    { accountId, dayKey: query.day_key || query.dayKey },
    { limit: Number(query.limit) || 50, skip: Number(query.skip) || 0 }
  );

  return {
    items: items.map(toRewardDto),
    total,
  };
}

async function evaluateRewards(accountId, payload = {}) {
  const settings = await settingsService.getSettingsRecord(accountId);

  if (!settings.allow_reward_eligibility) {
    throw new AppError('Reward eligibility is disabled for this user', {
      status: 403,
      code: dailyFlowErrorCodes.DAILY_FLOW_REWARDS_DISABLED,
    });
  }

  const timezone = settings.timezone || getBusinessTimezone();
  const dayKey = payload.day_key || payload.dayKey
    ? String(payload.day_key || payload.dayKey)
    : formatDayKey(new Date(), timezone);

  const day = await dayService.getOrCreateDay(accountId, dayKey);
  const userId = await resolveUserIdForAccount(accountId);

  info('Daily Flow evaluateRewards called', { accountId, dayKey });

  const createdRewards = [];
  const existingRewards = [];

  for (const [ruleKey, definition] of Object.entries(RULE_DEFINITIONS)) {
    const result = await evaluateRule(accountId, dayKey, ruleKey, definition, {
      timezone,
      userId,
      dayId: day._id,
    });

    if (result.reward) {
      if (result.created) createdRewards.push(result.reward);
      else existingRewards.push(result.reward);
    }
  }

  return {
    day_key: dayKey,
    created_rewards: createdRewards,
    existing_rewards: existingRewards,
  };
}

module.exports = {
  listRewards,
  evaluateRewards,
};
