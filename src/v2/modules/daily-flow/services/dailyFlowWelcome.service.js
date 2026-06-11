const { info } = require('../../../kernel/logger');
const userRepository = require('../../users/repositories/user.repository');
const dayRepository = require('../repositories/dailyFlowDay.repository');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const aiMemoryRepository = require('../repositories/dailyFlowAiMemory.repository');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const dayService = require('./dailyFlowDay.service');
const settingsService = require('./dailyFlowSettings.service');
const taskRecommendationService = require('./dailyFlowTaskRecommendation.service');
const aiService = require('./dailyFlowAi.service');
const { formatDayKey, getDayBounds } = require('../../activity/helpers/week.helper');

function getYesterdayDayKey(dayKey, timezone) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() - 1);
  return formatDayKey(anchor, timezone);
}

async function buildWelcomeContext(accountId, dayKey, timezone) {
  const userId = await resolveUserIdForAccount(accountId);
  const user = await userRepository.findByAccountId(accountId);
  const userName = user?.displayName || user?.firstName || 'there';
  const role = user?.jobTitle || user?.department || null;

  let candidates = [];
  try {
    candidates = await taskRecommendationService.buildRankedCandidates(
      userId,
      dayKey,
      timezone,
      accountId
    );
  } catch (_err) {
    candidates = [];
  }
  const assignedTaskCount = candidates.length;
  const highPriorityCount = candidates.filter((t) => ['high', 'urgent'].includes(t.priority)).length;
  const overdueCount = candidates.filter((t) => t.ruleReason?.includes('Overdue')).length;
  const topPriorityTaskTitle = candidates[0]?.title || null;

  const yesterdayKey = getYesterdayDayKey(dayKey, timezone);
  const yesterdayGoals = await goalRepository.listGoals(
    { accountId, dayKey: yesterdayKey, type: 'work', excludeDeletedStatus: true },
    { limit: 100, skip: 0 }
  );
  const pendingYesterdayCount = yesterdayGoals.items.filter((g) => g.status !== 'completed').length;

  const day = await dayRepository.findDayByAccountAndKey(accountId, dayKey);

  return {
    userName,
    role,
    assignedTaskCount,
    highPriorityCount,
    overdueCount,
    topPriorityTaskTitle,
    pendingYesterdayCount,
    dayStatus: day?.status || 'active',
  };
}

async function generateWelcome(accountId, dayKeyInput = null, { force = false } = {}) {
  const dayKey = dayKeyInput || await dayService.getTodayDayKey(accountId);
  const settings = await settingsService.getSettingsRecord(accountId);
  const timezone = settings.timezone || 'UTC';
  const userId = await resolveUserIdForAccount(accountId);

  info('Daily Flow generateWelcome', { accountId, dayKey, force });

  if (!force) {
    const cached = await getCachedWelcome(accountId, dayKey);
    if (cached?.message) {
      const context = await buildWelcomeContext(accountId, dayKey, timezone);
      return {
        day_key: dayKey,
        message: cached.message,
        fallback_used: cached.fallback_used,
        provider: cached.provider,
        model: null,
        reused: true,
        context_summary: {
          assigned_task_count: context.assignedTaskCount,
          high_priority_count: context.highPriorityCount,
          overdue_count: context.overdueCount,
          pending_yesterday_count: context.pendingYesterdayCount,
          top_priority_task: context.topPriorityTaskTitle,
        },
      };
    }
  }

  const context = await buildWelcomeContext(accountId, dayKey, timezone);
  const result = await aiService.generateWelcome({
    accountId,
    userId,
    dayKey,
    context,
    settings,
  });

  return {
    day_key: dayKey,
    message: result.text,
    fallback_used: result.fallback_used,
    provider: result.provider,
    model: result.model,
    reused: false,
    context_summary: {
      assigned_task_count: context.assignedTaskCount,
      high_priority_count: context.highPriorityCount,
      overdue_count: context.overdueCount,
      pending_yesterday_count: context.pendingYesterdayCount,
      top_priority_task: context.topPriorityTaskTitle,
    },
  };
}

async function getCachedWelcome(accountId, dayKey) {
  const memory = await aiMemoryRepository.findLatestByType(accountId, dayKey, 'welcome');
  if (!memory) return null;
  return {
    message: memory.outputText,
    fallback_used: memory.fallbackUsed,
    provider: memory.fallbackUsed ? 'rule' : memory.provider,
    generated_at: memory.createdAt,
  };
}

async function getCachedLearningTip(accountId, dayKey) {
  const memory = await aiMemoryRepository.findLatestByType(accountId, dayKey, 'learning_tip');
  if (memory) {
    return {
      message: memory.outputText,
      fallback_used: memory.fallbackUsed,
      generated_at: memory.createdAt,
    };
  }

  // Dashboard must not trigger OpenAI — rule-based tip only until explicitly requested later.
  return {
    message: aiService.buildRuleLearningTip(),
    fallback_used: true,
    generated_at: null,
  };
}

module.exports = {
  buildWelcomeContext,
  generateWelcome,
  getCachedWelcome,
  getCachedLearningTip,
};
