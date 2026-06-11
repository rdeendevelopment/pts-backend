const { info } = require('../../../kernel/logger');
const dayService = require('./dailyFlowDay.service');
const settingsService = require('./dailyFlowSettings.service');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const catchupRepository = require('../repositories/dailyFlowCatchup.repository');
const reflectionRepository = require('../repositories/dailyFlowReflection.repository');
const rewardRepository = require('../repositories/dailyFlowReward.repository');
const endDayReportRepository = require('../repositories/dailyFlowEndDayReport.repository');
const {
  toDayDto,
  toGoalDto,
  toCatchupDto,
  toReflectionDto,
  toRewardDto,
  toEndDayReportDto,
} = require('../dto/dailyFlow.dto');
const { buildProgressSummary } = require('../helpers/progress.helper');
const { assertValidDayKey } = require('../helpers/dayKey.helper');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const {
  parseDashboardGoalsLimit,
  parseDashboardCatchupsLimit,
} = require('../helpers/pagination.helper');
const taskRecommendationService = require('./dailyFlowTaskRecommendation.service');
const welcomeService = require('./dailyFlowWelcome.service');
const { safeLoad } = require('../helpers/safeLoad.helper');
const {
  calculateMyDayState,
  countTodayItems,
  countCompletedItems,
} = require('../helpers/myDayState.helper');
const { getActivityMinutesForDay } = require('../helpers/activityMinutes.helper');

async function buildDashboard(accountId, dayKeyInput, query = {}) {
  const dayKey = dayKeyInput
    ? assertValidDayKey(dayKeyInput)
    : await dayService.getTodayDayKey(accountId);

  const goalsLimit = parseDashboardGoalsLimit(query.goals_limit || query.goalsLimit);
  const catchupsLimit = parseDashboardCatchupsLimit(query.catchups_limit || query.catchupsLimit);

  info('Daily Flow buildDashboard', { accountId, dayKey, goalsLimit, catchupsLimit });

  const settings = await settingsService.getSettingsRecord(accountId);
  const timezone = settings.timezone || 'UTC';
  const userId = await resolveUserIdForAccount(accountId);

  const day = await dayService.getOrCreateDay(accountId, dayKey);

  const [
    goalsResult,
    catchupsResult,
    reflection,
    rewardsResult,
    assignedTaskSuggestions,
    aiWelcome,
    aiLearningTip,
    endDayReportDoc,
    activityMinutes,
  ] = await Promise.all([
    goalRepository.listGoals(
      { accountId, dayKey, excludeDeletedStatus: true },
      { limit: goalsLimit, skip: 0 }
    ),
    catchupRepository.listCatchups({ accountId, dayKey }, { limit: catchupsLimit, skip: 0 }),
    reflectionRepository.findReflectionByAccountAndDayKey(accountId, dayKey),
    rewardRepository.listRewards({ accountId, dayKey }, { limit: 50, skip: 0 }),
    safeLoad(
      'dashboard task suggestions',
      () => taskRecommendationService.getAssignedTaskSuggestions(accountId, userId, dayKey, timezone),
      []
    ),
    safeLoad(
      'dashboard cached welcome',
      () => welcomeService.getCachedWelcome(accountId, dayKey),
      null
    ),
    safeLoad(
      'dashboard learning tip',
      () => welcomeService.getCachedLearningTip(accountId, dayKey),
      { message: 'Pick two focused items for today.', fallback_used: true, generated_at: null }
    ),
    safeLoad(
      'dashboard end day report',
      () => endDayReportRepository.findByAccountAndDayKey(accountId, dayKey),
      null
    ),
    safeLoad(
      'dashboard activity minutes',
      () => getActivityMinutesForDay(userId, dayKey, timezone),
      0
    ),
  ]);

  const workGoals = goalsResult.items.filter((goal) => goal.type === 'work');
  const personalGoals = goalsResult.items.filter((goal) => goal.type === 'personal');
  const todayItems = goalsResult.items.map(toGoalDto);
  const todayItemsCount = countTodayItems(goalsResult.items, catchupsResult.items);
  const completedItemsCount = countCompletedItems(goalsResult.items);
  const myDayState = calculateMyDayState({
    endDayReport: endDayReportDoc,
    dayRecord: day,
    todayItemsCount,
    completedItemsCount,
    activityMinutes,
    timezone,
  });

  return {
    day: toDayDto(day),
    today_items: todayItems,
    work_goals: workGoals.map(toGoalDto),
    personal_goals: personalGoals.map(toGoalDto),
    catchups: catchupsResult.items.map(toCatchupDto),
    assigned_task_suggestions: assignedTaskSuggestions,
    ai_welcome: aiWelcome,
    ai_learning_tip: aiLearningTip,
    reflection: reflection ? toReflectionDto(reflection) : null,
    rewards: rewardsResult.items.map(toRewardDto),
    progress_summary: buildProgressSummary({
      workGoals,
      personalGoals,
    }),
    end_day_report: endDayReportDoc ? toEndDayReportDto(endDayReportDoc) : null,
    settings,
    meta: {
      product_name: 'My Day',
      ai_assistant_name: 'FlowMate AI',
      goals_limit: goalsLimit,
      goals_total: goalsResult.total,
      goals_truncated: goalsResult.total > goalsLimit,
      catchups_limit: catchupsLimit,
      catchups_total: catchupsResult.total,
      catchups_truncated: catchupsResult.total > catchupsLimit,
      day_state: myDayState.dayState,
      time_of_day: myDayState.timeOfDay,
      has_existing_plan: myDayState.hasExistingPlan,
      should_resume_plan: myDayState.shouldResumePlan,
      should_show_end_day: myDayState.shouldShowEndDay,
    },
  };
}

module.exports = {
  buildDashboard,
};
