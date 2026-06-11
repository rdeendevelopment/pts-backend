const { info } = require('../../../kernel/logger');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const dayRepository = require('../repositories/dailyFlowDay.repository');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const catchupRepository = require('../repositories/dailyFlowCatchup.repository');
const reflectionRepository = require('../repositories/dailyFlowReflection.repository');
const rewardRepository = require('../repositories/dailyFlowReward.repository');
const settingsRepository = require('../repositories/dailyFlowSettings.repository');
const { summarizeGoalsForAdmin } = require('../helpers/privacy.helper');
const { resolveAccountIdForUserId } = require('../helpers/account.helper');
const { toSettingsDto, toDayDto } = require('../dto/dailyFlow.dto');
const { formatDayKey, getWeekBounds, getBusinessTimezone } = require('../../activity/helpers/week.helper');
const { isWeekendDayKey } = require('../helpers/dayKey.helper');
const { parseDashboardGoalsLimit } = require('../helpers/pagination.helper');

function getCurrentWeekRange(timezone = getBusinessTimezone()) {
  const { weekStartDate } = getWeekBounds(new Date(), timezone);
  const dayKeys = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(weekStartDate);
    day.setUTCDate(day.getUTCDate() + offset);
    dayKeys.push(formatDayKey(day, timezone));
  }

  return {
    weekStart: dayKeys[0],
    weekEnd: dayKeys[dayKeys.length - 1],
    dayKeys,
    timezone,
  };
}

async function getTeamSummary(query = {}) {
  info('Daily Flow getTeamSummary called', { query });

  // TODO: Scope to manager direct reports when a shared team-hierarchy helper exists.
  const { weekStart, weekEnd, timezone } = getCurrentWeekRange();

  const [
    activeUsers,
    usersWithCompletedWorkGoals,
    blockersCount,
    totalWorkGoals,
    completedWorkGoals,
    weekendDays,
    rewardCandidates,
  ] = await Promise.all([
    dayRepository.countDistinctAccounts({ fromDayKey: weekStart, toDayKey: weekEnd }),
    goalRepository.countDistinctAccountsWithCompletedWorkGoals({
      fromDayKey: weekStart,
      toDayKey: weekEnd,
    }),
    reflectionRepository.countReflectionsWithBlockers({ fromDayKey: weekStart, toDayKey: weekEnd }),
    goalRepository.countGoals({
      type: 'work',
      fromDayKey: weekStart,
      toDayKey: weekEnd,
      excludeDeletedStatus: true,
    }),
    goalRepository.countGoals({
      type: 'work',
      status: 'completed',
      fromDayKey: weekStart,
      toDayKey: weekEnd,
      excludeDeletedStatus: true,
    }),
    dayRepository.listDays({ fromDayKey: weekStart, toDayKey: weekEnd }, { limit: 500, skip: 0 }),
    rewardRepository.countDistinctRewardCandidates({ fromDayKey: weekStart, toDayKey: weekEnd }),
  ]);

  const weekendContributors = new Set(
    weekendDays.items
      .filter((day) => isWeekendDayKey(day.dayKey, timezone))
      .map((day) => String(day.accountId))
  ).size;

  const workGoalCompletionRate = totalWorkGoals > 0
    ? Math.round((completedWorkGoals / totalWorkGoals) * 100)
    : 0;

  return {
    scope: 'account',
    week_start: weekStart,
    week_end: weekEnd,
    active_users: activeUsers,
    users_with_completed_work_goals: usersWithCompletedWorkGoals,
    blockers_count: blockersCount,
    weekend_contributors: weekendContributors,
    reward_candidates: rewardCandidates,
    work_goal_completion_rate: workGoalCompletionRate,
    personal_goal_details_included: false,
  };
}

async function getUserSummary(userIdInput, query = {}) {
  const userId = assertObjectId(userIdInput, 'user_id');
  const accountId = await resolveAccountIdForUserId(userId);
  const goalsLimit = parseDashboardGoalsLimit(query.goals_limit || query.goalsLimit);

  info('Daily Flow getUserSummary called', {
    userId: String(userId),
    accountId: String(accountId),
    goalsLimit,
  });

  const settingsDoc = await settingsRepository.findSettingsByAccountId(accountId);
  const settings = toSettingsDto(settingsDoc, { account_id: String(accountId) });
  const { weekStart, weekEnd } = getCurrentWeekRange(settings.timezone);
  const weekFilters = { accountId, fromDayKey: weekStart, toDayKey: weekEnd };

  const [daysResult, goalsResult, catchupsOpen, reflectionsCount, rewardsCount] = await Promise.all([
    dayRepository.listDays(weekFilters, { limit: 7, skip: 0 }),
    goalRepository.listGoals(
      { ...weekFilters, excludeDeletedStatus: true },
      { limit: goalsLimit, skip: 0 }
    ),
    catchupRepository.countCatchups({ accountId, status: 'open' }),
    reflectionRepository.countReflections(weekFilters),
    rewardRepository.countRewards(weekFilters),
  ]);

  const goalSummary = summarizeGoalsForAdmin(goalsResult.items, {
    shareWorkGoalsWithAdmin: settings.share_work_goals_with_admin,
    sharePersonalGoalsWithAdmin: settings.share_personal_goals_with_admin,
  });

  const workGoals = goalsResult.items.filter((goal) => goal.type === 'work');
  const personalGoals = goalsResult.items.filter((goal) => goal.type === 'personal');

  return {
    user_id: String(userId),
    account_id: String(accountId),
    week_start: weekStart,
    week_end: weekEnd,
    days: daysResult.items.map(toDayDto),
    goals: goalSummary,
    counts: {
      work_goals: workGoals.length,
      personal_goals: personalGoals.length,
      open_catchups: catchupsOpen,
      reflections_submitted: reflectionsCount,
      rewards_earned: rewardsCount,
    },
    settings: {
      share_work_goals_with_admin: settings.share_work_goals_with_admin,
      share_personal_goals_with_admin: settings.share_personal_goals_with_admin,
    },
    meta: {
      goals_limit: goalsLimit,
      goals_total: goalsResult.total,
      goals_truncated: goalsResult.total > goalsLimit,
    },
  };
}

module.exports = {
  getTeamSummary,
  getUserSummary,
};
