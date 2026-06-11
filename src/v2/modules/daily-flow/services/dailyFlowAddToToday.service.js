const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { info } = require('../../../kernel/logger');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const taskRepository = require('../../tasks/repositories/task.repository');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const { toGoalDto } = require('../dto/dailyFlow.dto');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const dayService = require('./dailyFlowDay.service');
const settingsService = require('./dailyFlowSettings.service');
const { assertValidDayKey } = require('../helpers/dayKey.helper');

async function addTaskToToday(accountId, taskIdInput, dayKeyInput = null) {
  const taskId = assertObjectId(taskIdInput, 'task_id');
  const userId = await resolveUserIdForAccount(accountId);
  const dayKey = dayKeyInput
    ? assertValidDayKey(dayKeyInput)
    : await dayService.getTodayDayKey(accountId);

  const task = await taskRepository.findById(taskId);
  if (!task || task.isDeleted) {
    throw new AppError('Task not found', {
      status: 404,
      code: dailyFlowErrorCodes.DAILY_FLOW_TASK_NOT_FOUND,
    });
  }

  const isAssigned = (task.assignees || []).some(
    (assignee) => String(assignee.userId) === String(userId)
  );
  if (!isAssigned) {
    throw new AppError('Task is not assigned to you', {
      status: 403,
      code: dailyFlowErrorCodes.DAILY_FLOW_TASK_NOT_ASSIGNED,
    });
  }

  if (task.status === 'completed') {
    throw new AppError('Task is already completed', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_TASK_ALREADY_COMPLETED,
    });
  }

  const existing = await goalRepository.findGoalByLinkedTask(accountId, dayKey, taskId);
  if (existing) {
    info('Daily Flow task already in today, returning existing goal', {
      accountId,
      taskId: String(taskId),
      dayKey,
      goalId: String(existing._id),
    });
    return toGoalDto(existing);
  }

  const settings = await settingsService.getSettingsRecord(accountId);
  const day = await dayService.getOrCreateDay(accountId, dayKey);

  try {
    const goal = await goalRepository.createGoal({
      accountId,
      userId,
      dayId: day._id,
      dayKey,
      dueDate: dayKey,
      type: 'work',
      title: task.title,
      description: task.description || null,
      targetValue: 1,
      currentValue: 0,
      unit: 'goal',
      visibility: settings.share_work_goals_with_admin ? 'admin' : 'private',
      sourceType: 'task',
      sourceId: taskId,
      linkedTaskId: taskId,
      syncTaskStatus: true,
      status: 'in_progress',
      isPrivate: !settings.share_work_goals_with_admin,
      sortOrder: 0,
    });

    info('Daily Flow task added to today', { accountId, taskId: String(taskId), dayKey, goalId: String(goal._id) });
    return toGoalDto(goal);
  } catch (err) {
    if (err?.code === 11000) {
      const raced = await goalRepository.findGoalByLinkedTask(accountId, dayKey, taskId);
      if (raced) return toGoalDto(raced);
    }
    throw err;
  }
}

module.exports = {
  addTaskToToday,
};
