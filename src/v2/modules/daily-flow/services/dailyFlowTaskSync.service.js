const { info, warn } = require('../../../kernel/logger');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const endDayReportRepository = require('../repositories/dailyFlowEndDayReport.repository');
const dayService = require('./dailyFlowDay.service');
const { logTaskSyncEvent } = require('../helpers/taskSyncAudit.helper');

function isLinkedSyncGoal(goal) {
  if (goal.type === 'personal') return false;
  const taskId = goal.linkedTaskId || (goal.sourceType === 'task' ? goal.sourceId : null);
  return Boolean(goal.syncTaskStatus && taskId);
}

function linkedTaskIdForGoal(goal) {
  return goal.linkedTaskId || (goal.sourceType === 'task' ? goal.sourceId : null) || null;
}

async function findTodayLinkedGoals(accountId, userId, taskId, dayKey) {
  const [linkedResult, sourceResult] = await Promise.all([
    goalRepository.listGoals(
      { accountId, dayKey, linkedTaskId: taskId, excludeDeletedStatus: true },
      { limit: 50, skip: 0 }
    ),
    goalRepository.listGoals(
      { accountId, dayKey, sourceId: taskId, sourceType: 'task', excludeDeletedStatus: true },
      { limit: 50, skip: 0 }
    ),
  ]);

  const merged = new Map();
  for (const goal of [...linkedResult.items, ...sourceResult.items]) {
    merged.set(String(goal._id), goal);
  }

  return [...merged.values()].filter(
    (goal) => goal.syncTaskStatus && String(goal.userId) === String(userId)
  );
}

async function markReportChangedAfterSubmission(accountId, dayKey, goalId) {
  const report = await endDayReportRepository.findByAccountAndDayKey(accountId, dayKey);
  if (!report || report.status !== 'submitted') return null;

  const changedItemsCount = (report.changedItemsCount || 0) + 1;
  const updated = await endDayReportRepository.upsertReport(accountId, dayKey, {
    hasChangesAfterSubmission: true,
    changedItemsCount,
    lastChangedGoalId: goalId ? String(goalId) : null,
    lastChangedAt: new Date(),
  });

  return updated;
}

async function syncGoalCompletedToTask(goal, accountId) {
  if (!isLinkedSyncGoal(goal)) {
    return { synced: false, reason: goal.type === 'personal' ? 'personal_goal_no_sync' : 'sync_disabled' };
  }

  const taskId = linkedTaskIdForGoal(goal);
  try {
    const taskBoardService = require('../../tasks/services/taskBoard.service');
    await taskBoardService.completeTask(taskId, accountId, null);
    await logTaskSyncEvent({
      event: 'my_day_goal_completed_task_completed',
      accountId,
      userId: goal.userId,
      dayKey: goal.dayKey,
      goalId: goal._id,
      taskId,
    });
    info('Daily Flow synced goal completion to task', {
      goalId: String(goal._id),
      taskId: String(taskId),
      accountId: String(accountId),
    });
    return { synced: true, taskId: String(taskId) };
  } catch (err) {
    warn('Daily Flow failed to sync goal completion to task', {
      goalId: String(goal._id),
      taskId: String(taskId),
      message: err.message,
    });
    return { synced: false, reason: 'task_complete_failed', message: err.message };
  }
}

async function syncGoalReopenedToTask(goal, accountId) {
  if (!isLinkedSyncGoal(goal)) {
    return { synced: false, reason: goal.type === 'personal' ? 'personal_goal_no_sync' : 'sync_disabled' };
  }

  const taskId = linkedTaskIdForGoal(goal);
  try {
    const taskBoardService = require('../../tasks/services/taskBoard.service');
    await taskBoardService.reopenTask(taskId, accountId, null);
    await logTaskSyncEvent({
      event: 'my_day_goal_reopened_task_reopened',
      accountId,
      userId: goal.userId,
      dayKey: goal.dayKey,
      goalId: goal._id,
      taskId,
    });
    info('Daily Flow synced goal reopen to task', {
      goalId: String(goal._id),
      taskId: String(taskId),
      accountId: String(accountId),
    });
    return { synced: true, taskId: String(taskId) };
  } catch (err) {
    warn('Daily Flow failed to sync goal reopen to task', {
      goalId: String(goal._id),
      taskId: String(taskId),
      message: err.message,
    });
    return { synced: false, reason: 'task_reopen_failed', message: err.message };
  }
}

async function syncTaskCompleted(taskIdInput, userIdInput, accountIdInput) {
  const taskId = assertObjectId(taskIdInput, 'task_id');
  const userId = assertObjectId(userIdInput, 'user_id');
  const accountId = assertObjectId(accountIdInput, 'account_id');
  const dayKey = await dayService.getTodayDayKey(accountId);

  const linkedGoals = await findTodayLinkedGoals(accountId, userId, taskId, dayKey);
  const activeGoals = linkedGoals.filter((goal) => goal.status !== 'completed');

  if (!activeGoals.length) {
    return { synced: false, updatedGoals: 0, dayKey };
  }

  const updates = await Promise.all(activeGoals.map(async (goal) => {
    const updated = await goalRepository.updateGoalById(goal._id, goal.accountId, {
      status: 'completed',
      completedAt: new Date(),
      currentValue: goal.targetValue != null
        ? Math.max(goal.currentValue || 0, goal.targetValue)
        : goal.currentValue,
    });
    return updated;
  }));

  await Promise.all(updates.map((goal) => logTaskSyncEvent({
    event: 'task_completed_my_day_goal_completed',
    accountId,
    userId,
    dayKey,
    goalId: goal._id,
    taskId,
  })));

  info('Daily Flow synced task completion to My Day goals', {
    taskId: String(taskId),
    userId: String(userId),
    dayKey,
    updatedGoals: updates.length,
  });

  return { synced: true, updatedGoals: updates.length, dayKey };
}

async function syncTaskReopened(taskIdInput, userIdInput, accountIdInput) {
  const taskId = assertObjectId(taskIdInput, 'task_id');
  const userId = assertObjectId(userIdInput, 'user_id');
  const accountId = assertObjectId(accountIdInput, 'account_id');
  const dayKey = await dayService.getTodayDayKey(accountId);

  const linkedGoals = await findTodayLinkedGoals(accountId, userId, taskId, dayKey);
  const completedGoals = linkedGoals.filter((goal) => goal.status === 'completed');

  if (!completedGoals.length) {
    return { synced: false, updatedGoals: 0, dayKey };
  }

  const updates = await Promise.all(completedGoals.map(async (goal) => {
    const nextStatus = goal.currentValue > 0 ? 'in_progress' : 'pending';
    const updated = await goalRepository.updateGoalById(goal._id, goal.accountId, {
      status: nextStatus,
      completedAt: null,
    });
    await markReportChangedAfterSubmission(accountId, dayKey, goal._id);
    return updated;
  }));

  await Promise.all(updates.map((goal) => logTaskSyncEvent({
    event: 'task_reopened_my_day_goal_reopened',
    accountId,
    userId,
    dayKey,
    goalId: goal._id,
    taskId,
  })));

  info('Daily Flow synced task reopen to My Day goals', {
    taskId: String(taskId),
    userId: String(userId),
    dayKey,
    updatedGoals: updates.length,
  });

  return { synced: true, updatedGoals: updates.length, dayKey };
}

module.exports = {
  isLinkedSyncGoal,
  syncGoalCompletedToTask,
  syncGoalReopenedToTask,
  syncTaskCompleted,
  syncTaskReopened,
  markReportChangedAfterSubmission,
};
