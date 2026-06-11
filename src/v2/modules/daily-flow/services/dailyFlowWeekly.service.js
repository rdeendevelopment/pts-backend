const { info } = require('../../../kernel/logger');
const { AppError } = require('../../../kernel/errors');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const dayRepository = require('../repositories/dailyFlowDay.repository');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const catchupRepository = require('../repositories/dailyFlowCatchup.repository');
const reflectionRepository = require('../repositories/dailyFlowReflection.repository');
const rewardRepository = require('../repositories/dailyFlowReward.repository');
const { toDayDto } = require('../dto/dailyFlow.dto');
const { assertValidDayKey, isWeekendDayKey } = require('../helpers/dayKey.helper');
const settingsService = require('./dailyFlowSettings.service');
const {
  getWeekBounds,
  buildWeekDayKeys,
  getBusinessTimezone,
} = require('../../activity/helpers/week.helper');

function resolveWeekRange(query = {}, settings = {}) {
  const timezone = settings.timezone || getBusinessTimezone();

  if (query.week_start || query.weekStart) {
    const weekStart = assertValidDayKey(query.week_start || query.weekStart);
    const weekEnd = query.week_end || query.weekEnd
      ? assertValidDayKey(query.week_end || query.weekEnd)
      : null;

    if (weekEnd && weekEnd < weekStart) {
      throw new AppError('Invalid week range', {
        status: 400,
        code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_DAY_KEY,
        details: { week_start: weekStart, week_end: weekEnd },
      });
    }

    const dayKeys = weekEnd
      ? buildDayKeysBetween(weekStart, weekEnd)
      : buildWeekDayKeysFromStart(weekStart, timezone);

    return { weekStart, weekEnd: weekEnd || dayKeys[dayKeys.length - 1], dayKeys, timezone };
  }

  const anchorDate = query.date ? new Date(query.date) : new Date();
  const { weekStartDate } = getWeekBounds(anchorDate, timezone);
  const dayKeys = buildWeekDayKeys(weekStartDate, timezone);

  return {
    weekStart: dayKeys[0],
    weekEnd: dayKeys[dayKeys.length - 1],
    dayKeys,
    timezone,
  };
}

function buildWeekDayKeysFromStart(weekStart, timezone) {
  const keys = [weekStart];
  const [year, month, day] = weekStart.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));

  for (let offset = 1; offset < 7; offset += 1) {
    const next = new Date(start);
    next.setUTCDate(next.getUTCDate() + offset);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(next);

    const mapped = {};
    for (const part of parts) {
      if (part.type !== 'literal') mapped[part.type] = part.value;
    }
    keys.push(`${mapped.year}-${mapped.month}-${mapped.day}`);
  }

  return keys;
}

function buildDayKeysBetween(startKey, endKey) {
  const keys = [];
  const [year, month, day] = startKey.split('-').map(Number);
  const [endYear, endMonth, endDay] = endKey.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cursor.getUTCDate()).padStart(2, '0');
    keys.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

async function getWeeklySummary(accountId, query = {}) {
  info('Daily Flow getWeeklySummary called', { accountId, query });

  const settings = await settingsService.getSettingsRecord(accountId);
  const { weekStart, weekEnd, dayKeys, timezone } = resolveWeekRange(query, settings);
  const weekFilters = { accountId, fromDayKey: weekStart, toDayKey: weekEnd };

  const [
    daysResult,
    totalGoals,
    completedGoals,
    workGoalsCompleted,
    personalGoalsCompleted,
    catchupsCreated,
    catchupsResolved,
    reflectionsSubmitted,
    rewardsEarned,
  ] = await Promise.all([
    dayRepository.listDays(weekFilters, { limit: 7, skip: 0 }),
    goalRepository.countGoals({ ...weekFilters, excludeDeletedStatus: true }),
    goalRepository.countGoals({ ...weekFilters, status: 'completed', excludeDeletedStatus: true }),
    goalRepository.countGoals({
      ...weekFilters,
      type: 'work',
      status: 'completed',
      excludeDeletedStatus: true,
    }),
    goalRepository.countGoals({
      ...weekFilters,
      type: 'personal',
      status: 'completed',
      excludeDeletedStatus: true,
    }),
    catchupRepository.countCatchups(weekFilters),
    catchupRepository.countCatchups({ ...weekFilters, status: 'done' }),
    reflectionRepository.countReflections(weekFilters),
    rewardRepository.countRewards(weekFilters),
  ]);

  const weekendActivity = dayKeys
    .filter((dayKey) => isWeekendDayKey(dayKey, timezone))
    .filter((dayKey) => daysResult.items.some((day) => day.dayKey === dayKey))
    .length;

  const completionPercentage = totalGoals > 0
    ? Math.round((completedGoals / totalGoals) * 100)
    : 0;

  return {
    week_start: weekStart,
    week_end: weekEnd,
    days: daysResult.items.map(toDayDto),
    days_count: daysResult.total,
    total_goals: totalGoals,
    completed_goals: completedGoals,
    work_goals_completed: workGoalsCompleted,
    personal_goals_completed: personalGoalsCompleted,
    catchups_created: catchupsCreated,
    catchups_resolved: catchupsResolved,
    reflections_submitted: reflectionsSubmitted,
    rewards_earned: rewardsEarned,
    weekend_activity: weekendActivity,
    completion_percentage: completionPercentage,
  };
}

module.exports = {
  getWeeklySummary,
};
