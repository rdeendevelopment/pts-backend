const { info, warn } = require('../../../kernel/logger');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const userRepository = require('../../users/repositories/user.repository');
const taskRepository = require('../../tasks/repositories/task.repository');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const catchupRepository = require('../repositories/dailyFlowCatchup.repository');
const endDayReportRepository = require('../repositories/dailyFlowEndDayReport.repository');
const dayRepository = require('../repositories/dailyFlowDay.repository');
const aiMemoryRepository = require('../repositories/dailyFlowAiMemory.repository');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const { assertValidDayKey } = require('../helpers/dayKey.helper');
const { pickString } = require('../helpers/payload.helper');
const dayService = require('./dailyFlowDay.service');
const settingsService = require('./dailyFlowSettings.service');
const taskRecommendationService = require('./dailyFlowTaskRecommendation.service');
const aiService = require('./dailyFlowAi.service');
const { buildFlowMateStatePrompt } = require('../helpers/dailyFlowAi.prompts');
const {
  buildRuleBasedFlowMateState,
  parseFlowMateStateJson,
} = require('../helpers/flowMateState.helper');
const {
  calculateMyDayState,
  countTodayItems,
  countCompletedItems,
  buildFlowMateCacheKey,
  shouldReuseFlowMateCache,
} = require('../helpers/myDayState.helper');
const { getActivityMinutesForDay } = require('../helpers/activityMinutes.helper');

async function loadEntity(accountId, entityId, entityType) {
  if (!entityId || !entityType || entityType === 'none') return null;

  try {
    if (entityType === 'task') {
      const task = await taskRepository.findById(entityId);
      if (!task || task.isDeleted) return null;
      return { type: 'task', title: task.title, priority: task.priority, status: task.status, raw: task };
    }
    if (entityType === 'goal' || entityType === 'personal_goal') {
      const goal = await goalRepository.findGoalById(entityId, accountId);
      if (!goal) return null;
      return {
        type: goal.type === 'personal' ? 'personal_goal' : 'goal',
        title: goal.title,
        priority: null,
        status: goal.status,
        linkedTaskId: goal.linkedTaskId || goal.sourceId,
        syncTaskStatus: goal.syncTaskStatus,
        raw: goal,
      };
    }
    if (entityType === 'catchup') {
      const catchup = await catchupRepository.findCatchupById(entityId, accountId);
      if (!catchup) return null;
      return { type: 'catchup', title: catchup.title, raw: catchup };
    }
    if (entityType === 'report') {
      const report = await endDayReportRepository.findByAccountAndDayKey(accountId, entityId);
      return report ? { type: 'report', title: 'End day report', raw: report } : null;
    }
  } catch (err) {
    warn('FlowMate entity load failed', { entityId, entityType, message: err.message });
  }
  return null;
}

async function buildFlowMateContext(accountId, { event, dayKey, entityId, entityType, taskSync }) {
  const settings = await settingsService.getSettingsRecord(accountId);
  const timezone = settings.timezone || 'UTC';
  const userId = await resolveUserIdForAccount(accountId);
  const user = await userRepository.findByAccountId(accountId);
  const userName = user?.displayName || user?.firstName || 'there';
  const role = user?.jobTitle || user?.department || null;

  const [goalsResult, catchupsResult, day, endDayReport, rankedCandidates, activityMinutes] = await Promise.all([
    goalRepository.listGoals({ accountId, dayKey, excludeDeletedStatus: true }, { limit: 200, skip: 0 }),
    catchupRepository.listCatchups({ accountId, dayKey }, { limit: 200, skip: 0 }),
    dayRepository.findDayByAccountAndKey(accountId, dayKey),
    endDayReportRepository.findByAccountAndDayKey(accountId, dayKey),
    taskRecommendationService.buildRankedCandidates(userId, dayKey, timezone, accountId).catch(() => []),
    getActivityMinutesForDay(userId, dayKey, timezone).catch(() => 0),
  ]);

  const workGoals = goalsResult.items.filter((g) => g.type === 'work');
  const personalGoals = goalsResult.items.filter((g) => g.type === 'personal');
  const todayItemsCount = countTodayItems(goalsResult.items, catchupsResult.items);
  const completedItemsCount = countCompletedItems(goalsResult.items);
  const myDayState = calculateMyDayState({
    endDayReport,
    dayRecord: day,
    todayItemsCount,
    completedItemsCount,
    activityMinutes,
    timezone,
  });
  const plannedWork = workGoals;
  const completedWork = workGoals.filter((g) => g.status === 'completed');
  const pendingWork = workGoals.filter((g) => g.status !== 'completed');

  const suggestions = rankedCandidates.map((t) => ({
    taskId: t.taskId,
    title: t.title,
    priority: t.priority,
    status: t.status,
    reason: t.ruleReason,
    ruleReason: t.ruleReason,
    alreadyAddedToToday: t.alreadyAddedToToday,
  }));

  const notAdded = suggestions.filter((s) => !s.alreadyAddedToToday);
  const primaryCandidate = notAdded[0] || suggestions[0] || null;
  const nextCandidate = notAdded[1] || suggestions[1] || null;

  let entity = null;
  if (entityId) {
    const normalizedType = entityType === 'none' ? null : entityType;
    entity = await loadEntity(accountId, entityId, normalizedType);
  }

  const isPersonalGoal = entity?.type === 'personal_goal'
    || entityType === 'personal_goal'
    || (entity?.raw?.type === 'personal');
  const isLinkedTask = Boolean(
    entity?.linkedTaskId
    || entity?.raw?.linkedTaskId
    || entity?.raw?.sourceType === 'task'
    || entityType === 'task'
  );
  const taskPriority = entity?.priority || entity?.raw?.priority || primaryCandidate?.priority || null;

  return {
    userName,
    role,
    dayKey,
    dayStatus: day?.status || 'active',
    assignedTaskCount: rankedCandidates.length,
    plannedWork,
    pendingWork,
    completedWork,
    personalGoalsCount: personalGoals.length,
    personalGoalsCompleted: personalGoals.filter((g) => g.status === 'completed').length,
    plannedWorkTitles: plannedWork.map((g) => g.title),
    completedWorkTitles: completedWork.map((g) => g.title),
    pendingWorkTitles: pendingWork.map((g) => g.title),
    suggestions,
    primaryCandidate,
    nextCandidate,
    entity,
    entityTitle: entity?.title || null,
    entityType: entity?.type || entityType || 'none',
    isPersonalGoal,
    isLinkedTask,
    taskPriority,
    endDayReport,
    endDaySummary: endDayReport?.aiSummary || null,
    taskSync: taskSync || null,
    todayItemsCount,
    completedItemsCount,
    activityMinutes,
    catchupsCount: catchupsResult.total,
    myDayState,
    settings,
    userId,
    timezone,
  };
}

function compactInputSnapshot(context, event) {
  return {
    event,
    dayKey: context.dayKey,
    dayState: context.myDayState?.dayState,
    timeOfDay: context.myDayState?.timeOfDay,
    dayStatus: context.dayStatus,
    assignedTaskCount: context.assignedTaskCount,
    plannedCount: context.plannedWork.length,
    pendingCount: context.pendingWork.length,
    completedCount: context.completedWork.length,
    todayItemsCount: context.todayItemsCount,
    personalGoalsCount: context.personalGoalsCount,
    personalGoalsCompleted: context.personalGoalsCompleted,
    suggestionIds: context.suggestions.slice(0, 5).map((s) => s.taskId),
    entityType: context.entityType,
    hasEndDayReport: Boolean(context.endDayReport),
  };
}

async function saveFlowMateMemory({
  accountId,
  userId,
  dayKey,
  event,
  inputSnapshot,
  state,
  provider,
  model,
  tokens,
  fallbackUsed,
  cacheKey,
}) {
  return aiMemoryRepository.createMemory({
    accountId,
    userId,
    dayKey,
    type: 'flowmate_state',
    event,
    cacheKey,
    inputSnapshot,
    outputText: state.message,
    structuredOutput: state,
    provider,
    model,
    tokens,
    fallbackUsed,
  });
}

async function generateFlowMateState(accountId, payload = {}) {
  const event = String(payload.event || '').trim();
  const dayKey = payload.day_key || payload.dayKey
    ? assertValidDayKey(payload.day_key || payload.dayKey)
    : await dayService.getTodayDayKey(accountId);

  const entityIdRaw = pickString(payload, 'entityId', 'entity_id');
  const entityId = entityIdRaw ? assertObjectId(entityIdRaw, 'entity_id') : null;
  const entityType = String(payload.entityType || payload.entity_type || 'none').toLowerCase();
  const taskSync = payload.task_sync || payload.taskSync || null;

  info('FlowMate generateState', { accountId, event, dayKey, entityType });

  const context = await buildFlowMateContext(accountId, {
    event,
    dayKey,
    entityId,
    entityType,
    taskSync,
  });

  const cacheKey = buildFlowMateCacheKey({
    userId: context.userId,
    dayKey,
    event,
    dayState: context.myDayState.dayState,
    plannedItemCount: context.todayItemsCount,
    completedItemCount: context.completedItemsCount,
    timeOfDay: context.myDayState.timeOfDay,
  });

  if (shouldReuseFlowMateCache(event)) {
    const cached = await aiMemoryRepository.findLatestByCacheKey(
      accountId,
      dayKey,
      'flowmate_state',
      cacheKey
    );
    if (cached?.structuredOutput) {
      info('FlowMate state cache hit', { accountId, dayKey, event, cacheKey });
      return {
        ...cached.structuredOutput,
        event,
        dayKey,
        cacheKey,
        reused: true,
      };
    }
  }

  const aiDisabled = !aiService.isAiAvailable(context.settings);
  let state = buildRuleBasedFlowMateState({ ...context, aiDisabled }, event);
  let model = null;
  let tokens = 0;

  if (!aiDisabled && context.settings.allow_ai_task_recommendations !== false) {
    try {
      const promptContext = {
        userName: context.userName,
        role: context.role,
        event,
        dayKey,
        dayStatus: context.dayStatus,
        plannedWorkTitles: context.plannedWorkTitles,
        personalGoalsCount: context.personalGoalsCount,
        personalGoalsCompleted: context.personalGoalsCompleted,
        completedWorkTitles: context.completedWorkTitles,
        pendingWorkTitles: context.pendingWorkTitles,
        assignedTaskCount: context.assignedTaskCount,
        suggestions: context.suggestions,
        entityTitle: context.entityTitle,
        entityType: context.entityType,
        endDaySummary: context.endDaySummary,
        taskSync,
        dayState: context.myDayState.dayState,
        timeOfDay: context.myDayState.timeOfDay,
        myDayState: context.myDayState,
      };

      const result = await aiService.callOpenAi(
        () => buildFlowMateStatePrompt(promptContext),
        { maxTokens: 600 }
      );

      const parsed = parseFlowMateStateJson(result.content, context, event);
      if (parsed) {
        state = parsed;
        model = result.model;
        tokens = result.totalTokens || 0;
      }
    } catch (err) {
      warn('FlowMate AI state failed, using rule fallback', { accountId, event, message: err.message });
    }
  }

  state.event = event;
  state.dayKey = dayKey;
  state.dayState = context.myDayState.dayState;
  state.timeOfDay = context.myDayState.timeOfDay;
  state.hasExistingPlan = context.myDayState.hasExistingPlan;
  state.shouldResumePlan = context.myDayState.shouldResumePlan;
  state.shouldShowEndDay = context.myDayState.shouldShowEndDay;
  state.cacheKey = cacheKey;
  state.reused = false;

  await saveFlowMateMemory({
    accountId,
    userId: context.userId,
    dayKey,
    event,
    inputSnapshot: compactInputSnapshot(context, event),
    state,
    provider: state.fallbackUsed ? 'rule' : 'openai',
    model,
    tokens,
    fallbackUsed: state.fallbackUsed,
    cacheKey,
  });

  return state;
}

async function buildMyDayMeta(accountId, dayKey, timezone) {
  const context = await buildFlowMateContext(accountId, {
    event: 'day_opened',
    dayKey,
    entityId: null,
    entityType: 'none',
    taskSync: null,
  });
  return {
    ...context.myDayState,
    today_items_count: context.todayItemsCount,
    completed_items_count: context.completedItemsCount,
    linked_task_items_count: context.plannedWork.filter(
      (g) => g.sourceType === 'task' || g.linkedTaskId
    ).length,
    activity_minutes: context.activityMinutes,
  };
}

module.exports = {
  buildFlowMateContext,
  generateFlowMateState,
  buildMyDayMeta,
};
