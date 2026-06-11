const { info, warn } = require('../../../kernel/logger');
const aiEnv = require('../../ai/config/ai.env');
const { isOpenAiConfigured, chatCompletion } = require('../../ai/providers/openai.provider');
const dailyFlowAiEnv = require('../config/dailyFlowAi.env');
const aiMemoryRepository = require('../repositories/dailyFlowAiMemory.repository');
const {
  buildWelcomePrompt,
  buildTaskRecommendationPrompt,
  buildEndDaySummaryPrompt,
  buildLearningTipPrompt,
} = require('../helpers/dailyFlowAi.prompts');

function truncateWords(text, maxWords) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}...`;
}

function isAiAvailable(settings = {}) {
  return Boolean(
    dailyFlowAiEnv.enabled
    && aiEnv.enabled
    && isOpenAiConfigured()
    && settings.enable_ai_companion !== false
  );
}

async function saveMemory({
  accountId,
  userId,
  dayKey,
  type,
  inputSnapshot,
  outputText,
  provider = 'openai',
  model,
  tokens = 0,
  fallbackUsed = false,
}) {
  return aiMemoryRepository.createMemory({
    accountId,
    userId,
    dayKey,
    type,
    inputSnapshot,
    outputText,
    provider,
    model: model || dailyFlowAiEnv.model,
    tokens,
    fallbackUsed,
  });
}

async function callOpenAi(promptBuilder, { maxTokens = 300 } = {}) {
  const built = typeof promptBuilder === 'function' ? promptBuilder() : promptBuilder;
  const { messages, responseFormat } = built;
  return chatCompletion({
    model: dailyFlowAiEnv.model,
    messages,
    temperature: 0.4,
    maxTokens,
    responseFormat,
    timeoutMs: dailyFlowAiEnv.timeoutMs,
  });
}

function buildRuleWelcome(context = {}) {
  const name = context.userName || 'there';
  const assigned = context.assignedTaskCount || 0;
  const high = context.highPriorityCount || 0;
  const overdue = context.overdueCount || 0;
  const top = context.topPriorityTaskTitle;

  let message = `Good morning ${name}. You have ${assigned} assigned task${assigned === 1 ? '' : 's'}`;
  if (high > 0) message += `, ${high} high priority`;
  if (overdue > 0) message += `, and ${overdue} overdue`;
  message += '.';

  if (top) {
    message += ` Consider starting with "${top}" if it fits your morning.`;
  } else {
    message += ' Pick 2–3 focused items for today.';
  }

  return truncateWords(message, dailyFlowAiEnv.maxWelcomeWords);
}

function buildRuleLearningTip() {
  const tips = [
    'Start with your smallest high-impact task to build momentum.',
    'Block 25 minutes for deep work before checking messages.',
    'Pick two must-do items and treat everything else as bonus progress.',
    'Write tomorrow\'s top priority before you close your laptop.',
  ];
  return tips[Math.floor(Math.random() * tips.length)];
}

function buildRuleEndSummary(context = {}) {
  const completed = context.completedWorkCount || 0;
  const pending = context.pendingWorkCount || 0;
  const linked = context.completedLinkedTaskCount || 0;
  const minutes = context.totalActivityMinutes || 0;

  if (completed === 0 && linked === 0) {
    let message = 'You closed out the day. Even quiet days are valid — tomorrow is a fresh start.';
    if (context.tomorrowPlan) {
      message += ' Your plan for tomorrow is noted.';
    }
    return truncateWords(message, dailyFlowAiEnv.maxEndSummaryWords);
  }

  let message = `You wrapped up ${completed} work item${completed === 1 ? '' : 's'}`;
  if (linked > 0) message += ` and completed ${linked} linked task${linked === 1 ? '' : 's'}`;
  message += '.';

  if (minutes > 0) {
    message += ` You logged ${minutes} activity minutes today.`;
  }

  if (pending > 0) {
    message += ` ${pending} item${pending === 1 ? ' remains' : 's remain'} for another day — that\'s okay.`;
  } else {
    message += ' Nice steady progress today.';
  }

  if (context.tomorrowPlan) {
    message += ' Your plan for tomorrow is noted.';
  }

  return truncateWords(message, dailyFlowAiEnv.maxEndSummaryWords);
}

function buildRuleTaskReasons(tasks = []) {
  return tasks.map((task) => ({
    taskId: task.taskId,
    reason: task.ruleReason || 'Recommended based on priority and due date.',
  }));
}

function parseTaskRecommendationResponse(content, tasks) {
  try {
    const parsed = JSON.parse(content);
    const rows = Array.isArray(parsed) ? parsed : (parsed.recommendations || parsed.tasks || []);
    if (!Array.isArray(rows)) return null;

    const reasonMap = new Map(rows.map((row) => [String(row.taskId), row.reason]));
    return tasks.map((task) => ({
      ...task,
      reason: reasonMap.get(String(task.taskId)) || task.ruleReason,
    }));
  } catch (_err) {
    return null;
  }
}

async function generateWelcome({
  accountId,
  userId,
  dayKey,
  context,
  settings,
}) {
  const inputSnapshot = { ...context, personalGoalTitles: undefined };
  let fallbackUsed = true;
  let outputText = buildRuleWelcome(context);
  let model = null;
  let tokens = 0;

  if (isAiAvailable(settings)) {
    try {
      const result = await callOpenAi(() => buildWelcomePrompt(context), { maxTokens: 200 });
      if (result.content?.trim()) {
        outputText = truncateWords(result.content.trim(), dailyFlowAiEnv.maxWelcomeWords);
        fallbackUsed = false;
        model = result.model;
        tokens = result.totalTokens || 0;
        info('Daily Flow AI welcome generated', { accountId, dayKey, tokens, latencyMs: result.latencyMs });
      }
    } catch (err) {
      warn('Daily Flow AI welcome failed, using fallback', { accountId, dayKey, message: err.message });
    }
  }

  await saveMemory({
    accountId,
    userId,
    dayKey,
    type: 'welcome',
    inputSnapshot,
    outputText,
    provider: fallbackUsed ? 'rule' : 'openai',
    model,
    tokens,
    fallbackUsed,
  });

  return { text: outputText, fallback_used: fallbackUsed, provider: fallbackUsed ? 'rule' : 'openai', model };
}

async function generateLearningTip({ accountId, userId, dayKey, settings }) {
  let fallbackUsed = true;
  let outputText = buildRuleLearningTip();
  let model = null;
  let tokens = 0;

  if (isAiAvailable(settings)) {
    try {
      const result = await callOpenAi(buildLearningTipPrompt, { maxTokens: 80 });
      if (result.content?.trim()) {
        outputText = truncateWords(result.content.trim(), 30);
        fallbackUsed = false;
        model = result.model;
        tokens = result.totalTokens || 0;
      }
    } catch (err) {
      warn('Daily Flow AI learning tip failed, using fallback', { accountId, dayKey, message: err.message });
    }
  }

  await saveMemory({
    accountId,
    userId,
    dayKey,
    type: 'learning_tip',
    inputSnapshot: {},
    outputText,
    provider: fallbackUsed ? 'rule' : 'openai',
    model,
    tokens,
    fallbackUsed,
  });

  return { text: outputText, fallback_used: fallbackUsed };
}

async function generateTaskRecommendations({
  accountId,
  userId,
  dayKey,
  tasks,
  settings,
}) {
  const inputSnapshot = { taskCount: tasks.length, taskIds: tasks.map((t) => t.taskId) };
  let enriched = tasks.map((task) => ({ ...task, reason: task.ruleReason }));
  let fallbackUsed = true;
  let model = null;
  let tokens = 0;

  if (isAiAvailable(settings) && settings.allow_ai_task_recommendations !== false && tasks.length > 0) {
    try {
      const result = await callOpenAi(() => buildTaskRecommendationPrompt({ tasks }), { maxTokens: 400 });
      const parsed = parseTaskRecommendationResponse(result.content, tasks);
      if (parsed) {
        enriched = parsed;
        fallbackUsed = false;
        model = result.model;
        tokens = result.totalTokens || 0;
      }
    } catch (err) {
      warn('Daily Flow AI task recommendations failed, using fallback', {
        accountId,
        dayKey,
        message: err.message,
      });
    }
  }

  if (fallbackUsed) {
    enriched = tasks.map((task) => ({
      ...task,
      reason: task.ruleReason || buildRuleTaskReasons([task])[0].reason,
    }));
  }

  await saveMemory({
    accountId,
    userId,
    dayKey,
    type: 'task_recommendation',
    inputSnapshot,
    outputText: enriched.map((t) => `${t.taskId}: ${t.reason}`).join('\n'),
    provider: fallbackUsed ? 'rule' : 'openai',
    model,
    tokens,
    fallbackUsed,
  });

  return { recommendations: enriched, fallback_used: fallbackUsed };
}

async function generateEndDaySummary({
  accountId,
  userId,
  dayKey,
  context,
  settings,
}) {
  const inputSnapshot = { ...context, personalGoalTitles: undefined };
  let fallbackUsed = true;
  let outputText = buildRuleEndSummary(context);
  let model = null;
  let tokens = 0;

  if (isAiAvailable(settings) && settings.allow_ai_end_day_summary !== false) {
    try {
      const result = await callOpenAi(() => buildEndDaySummaryPrompt(context), { maxTokens: 250 });
      if (result.content?.trim()) {
        outputText = truncateWords(result.content.trim(), dailyFlowAiEnv.maxEndSummaryWords);
        fallbackUsed = false;
        model = result.model;
        tokens = result.totalTokens || 0;
      }
    } catch (err) {
      warn('Daily Flow AI end-day summary failed, using fallback', { accountId, dayKey, message: err.message });
    }
  }

  await saveMemory({
    accountId,
    userId,
    dayKey,
    type: 'end_summary',
    inputSnapshot,
    outputText,
    provider: fallbackUsed ? 'rule' : 'openai',
    model,
    tokens,
    fallbackUsed,
  });

  return { text: outputText, fallback_used: fallbackUsed, provider: fallbackUsed ? 'rule' : 'openai', model };
}

module.exports = {
  isAiAvailable,
  callOpenAi,
  buildRuleWelcome,
  buildRuleLearningTip,
  buildRuleEndSummary,
  generateWelcome,
  generateLearningTip,
  generateTaskRecommendations,
  generateEndDaySummary,
};
