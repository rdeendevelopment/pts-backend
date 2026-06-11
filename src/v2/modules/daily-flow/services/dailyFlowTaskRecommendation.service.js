const { info, warn } = require('../../../kernel/logger');
const taskRepository = require('../../tasks/repositories/task.repository');
const projectRepository = require('../../projects/repositories/project.repository');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const { TASK_PRIORITY_WEIGHTS } = require('../constants/dailyFlow.constants');
const { formatDayKey, getDayBounds } = require('../../activity/helpers/week.helper');
const aiService = require('./dailyFlowAi.service');

const HIGH_PRIORITIES = new Set(['high', 'urgent']);

function isSameDay(dateA, dateB, timezone) {
  return formatDayKey(dateA, timezone) === formatDayKey(dateB, timezone);
}

function buildRuleReason(task, { isOverdue, isDueToday, isHighPriority, isRecentlyUpdated }) {
  if (isOverdue) return 'Overdue — needs attention today';
  if (isDueToday && isHighPriority) return 'Due today with high priority';
  if (isDueToday) return 'Due today';
  if (isHighPriority) return 'High priority assigned task';
  if (isRecentlyUpdated) return 'Recently updated and in progress';
  return 'Assigned task worth considering today';
}

function scoreTask(task, { now, todayStart, todayEnd, timezone }) {
  let score = 0;
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = Boolean(dueDate && dueDate < now && task.status === 'active');
  const isDueToday = Boolean(dueDate && isSameDay(dueDate, todayStart, timezone));
  const isHighPriority = HIGH_PRIORITIES.has(task.priority);
  const hoursSinceUpdate = (now - new Date(task.updatedAt)) / (1000 * 60 * 60);
  const isRecentlyUpdated = hoursSinceUpdate <= 48;

  if (isOverdue) score += 1000;
  if (isDueToday) score += 500;
  if (isHighPriority) score += 200 + (TASK_PRIORITY_WEIGHTS[task.priority] || 0) * 10;
  if (task.status === 'active') score += 50;
  if (isRecentlyUpdated) score += Math.max(0, 40 - hoursSinceUpdate);

  const ruleReason = buildRuleReason(task, { isOverdue, isDueToday, isHighPriority, isRecentlyUpdated });

  return { score, ruleReason, isOverdue, isDueToday, isHighPriority, isRecentlyUpdated };
}

async function fetchAssignedTaskCandidates(userId) {
  try {
    const { items } = await taskRepository.listAggregate(
      {
        statusNe: 'archived',
        status: 'active',
        relevanceOr: [{ 'assignees.userId': userId }],
      },
      { sort: { updatedAt: -1 }, limit: 100 }
    );

    return items.filter((task) => task.status !== 'completed');
  } catch (err) {
    warn('Daily Flow task candidates fetch failed', { userId: String(userId), message: err.message });
    return [];
  }
}

async function loadProjectNames(tasks) {
  const projectIds = [...new Set(tasks.map((t) => String(t.projectId)).filter(Boolean))];
  const projectMap = new Map();

  await Promise.all(projectIds.map(async (projectId) => {
    try {
      const project = await projectRepository.findById(projectId);
      if (project) projectMap.set(String(projectId), project.name || project.title || 'Project');
    } catch (_err) {
      projectMap.set(String(projectId), null);
    }
  }));

  return projectMap;
}

async function buildRankedCandidates(userId, dayKey, timezone, accountId = null) {
  const now = new Date();
  const [year, month, day] = dayKey.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const { dayStart } = getDayBounds(anchor, timezone);

  const tasks = await fetchAssignedTaskCandidates(userId);
  const projectMap = await loadProjectNames(tasks);

  const goalFilters = { dayKey, sourceType: 'task', excludeDeletedStatus: true };
  if (accountId) goalFilters.accountId = accountId;
  const todayGoals = await goalRepository.listGoals(goalFilters, { limit: 200, skip: 0 });
  const addedTaskIds = new Set(
    todayGoals.items
      .filter((g) => g.linkedTaskId || g.sourceId)
      .map((g) => String(g.linkedTaskId || g.sourceId))
  );

  const ranked = tasks.map((task) => {
    const { score, ruleReason } = scoreTask(task, { now, todayStart: dayStart, timezone });
    return {
      taskId: String(task._id),
      title: task.title,
      projectName: projectMap.get(String(task.projectId)) || null,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
      ruleReason,
      recommendationRank: 0,
      score,
      alreadyAddedToToday: addedTaskIds.has(String(task._id)),
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  return ranked.map((row, index) => ({
    ...row,
    recommendationRank: index + 1,
    score: undefined,
  }));
}

async function getAssignedTaskSuggestions(accountId, userId, dayKey, timezone) {
  const candidates = await buildRankedCandidates(userId, dayKey, timezone, accountId);
  return candidates.slice(0, 10).map((task) => ({
    task_id: task.taskId,
    title: task.title,
    project_name: task.projectName,
    priority: task.priority,
    status: task.status,
    due_date: task.dueDate,
    reason: task.ruleReason,
    recommendation_rank: task.recommendationRank,
    already_added_to_today: task.alreadyAddedToToday,
  }));
}

async function recommendTasks({
  accountId,
  userId,
  dayKey,
  timezone,
  settings,
  limit = 5,
}) {
  info('Daily Flow recommendTasks', { accountId, dayKey });

  const candidates = await buildRankedCandidates(userId, dayKey, timezone, accountId);
  const cappedLimit = Math.min(Math.max(Number(limit) || 5, 3), 5);
  const topCandidates = candidates.filter((t) => !t.alreadyAddedToToday).slice(0, cappedLimit);

  const { recommendations, fallback_used: fallbackUsed } = await aiService.generateTaskRecommendations({
    accountId,
    userId,
    dayKey,
    tasks: topCandidates,
    settings,
  });

  return {
    recommendation_mode: fallbackUsed ? 'rule_based' : 'openai',
    fallback_used: fallbackUsed,
    recommendations: recommendations.map((task) => ({
      task_id: task.taskId,
      title: task.title,
      project_name: task.projectName,
      priority: task.priority,
      status: task.status,
      due_date: task.dueDate,
      reason: task.reason,
      recommendation_rank: task.recommendationRank,
      already_added_to_today: task.alreadyAddedToToday,
    })),
  };
}

module.exports = {
  buildRankedCandidates,
  getAssignedTaskSuggestions,
  recommendTasks,
};
