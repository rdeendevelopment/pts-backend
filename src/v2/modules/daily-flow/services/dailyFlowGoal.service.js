const { AppError } = require('../../../kernel/errors');
const { info, warn } = require('../../../kernel/logger');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const {
  GOAL_TYPES,
  GOAL_STATUSES,
  GOAL_SOURCE_TYPES,
  GOAL_VISIBILITY,
} = require('../constants/dailyFlow.constants');
const goalRepository = require('../repositories/dailyFlowGoal.repository');
const { toGoalDto } = require('../dto/dailyFlow.dto');
const { assertValidDayKey, resolveDayKeyFromInput } = require('../helpers/dayKey.helper');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const { defaultGoalPrivacy } = require('../helpers/privacy.helper');
const { pickString, pickNumber, pickField, pickBoolean } = require('../helpers/payload.helper');
const { parseListLimit } = require('../helpers/pagination.helper');
const dayService = require('./dailyFlowDay.service');
const settingsService = require('./dailyFlowSettings.service');
const taskSyncService = require('./dailyFlowTaskSync.service');
const { getBusinessTimezone } = require('../../activity/helpers/week.helper');

function assertValidGoalType(type) {
  if (!GOAL_TYPES.includes(type)) {
    throw new AppError('Invalid goal type', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_GOAL_TYPE,
      details: { allowed: GOAL_TYPES },
    });
  }
}

async function getOwnedGoal(accountId, goalId) {
  const normalizedGoalId = assertObjectId(goalId, 'goal_id');
  const goal = await goalRepository.findGoalById(normalizedGoalId, accountId);

  if (!goal || goal.status === 'deleted') {
    throw new AppError('Daily Flow goal not found', {
      status: 404,
      code: dailyFlowErrorCodes.DAILY_FLOW_GOAL_NOT_FOUND,
    });
  }

  return goal;
}

function resolveGoalPrivacy(type, settings, visibility) {
  if (type === 'personal') {
    return true;
  }

  if (visibility === 'admin' && settings.share_work_goals_with_admin) {
    return false;
  }

  return !settings.share_work_goals_with_admin;
}

async function resolveGoalDayKey(accountId, payload = {}) {
  const settings = await settingsService.getSettingsRecord(accountId);
  const timezone = settings.timezone || getBusinessTimezone();
  const dayKey = payload.day_key || payload.dayKey;
  const dueDate = payload.due_date || payload.dueDate;

  if (dayKey) return assertValidDayKey(dayKey);
  if (dueDate) return resolveDayKeyFromInput(dueDate, timezone);

  throw new AppError('day_key or due_date is required', {
    status: 400,
    code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_DAY_KEY,
    fields: { day_key: 'day_key or due_date is required' },
  });
}

async function listGoals(accountId, query = {}) {
  info('Daily Flow listGoals called', { accountId, query });

  const filters = { accountId, excludeDeletedStatus: true };
  if (query.day_key || query.dayKey) {
    filters.dayKey = assertValidDayKey(query.day_key || query.dayKey);
  }
  if (query.type || query.goal_type || query.goalType) {
    filters.type = query.type || query.goal_type || query.goalType;
  }
  if (query.status) filters.status = query.status;

  const { items, total } = await goalRepository.listGoals(filters, {
    limit: parseListLimit(query.limit, 50, 200),
    skip: Number(query.skip) || 0,
  });

  return {
    items: items.map(toGoalDto),
    total,
  };
}

async function createGoal(accountId, payload = {}) {
  const type = String(payload.goal_type || payload.goalType || payload.type || '').toLowerCase();
  assertValidGoalType(type);

  const title = pickString(payload, 'title');
  if (!title) {
    throw new AppError('Goal title is required', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_GOAL_TYPE,
      fields: { title: 'title is required' },
    });
  }

  const dayKey = await resolveGoalDayKey(accountId, payload);
  const settings = await settingsService.getSettingsRecord(accountId);
  const userId = await resolveUserIdForAccount(accountId);
  const day = await dayService.getOrCreateDay(accountId, dayKey);

  const visibility = pickString(payload, 'visibility') || 'private';
  if (!GOAL_VISIBILITY.includes(visibility)) {
    throw new AppError('Invalid goal visibility', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_GOAL_TYPE,
      fields: { visibility: `visibility must be one of: ${GOAL_VISIBILITY.join(', ')}` },
    });
  }

  const sourceType = pickString(payload, 'sourceType', 'source_type') || 'manual';
  if (!GOAL_SOURCE_TYPES.includes(sourceType)) {
    throw new AppError('Invalid goal source type', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_GOAL_TYPE,
      fields: { source_type: `source_type must be one of: ${GOAL_SOURCE_TYPES.join(', ')}` },
    });
  }

  const sourceIdRaw = pickString(payload, 'sourceId', 'source_id');
  const sourceId = sourceIdRaw ? assertObjectId(sourceIdRaw, 'source_id') : null;

  const targetValue = pickNumber(payload, 'targetValue', 'target_value');
  const currentValue = pickNumber(payload, 'currentValue', 'current_value') ?? 0;
  const requestedStatus = pickString(payload, 'status');
  const linkedTaskIdRaw = pickString(payload, 'linkedTaskId', 'linked_task_id');
  const linkedTaskId = linkedTaskIdRaw ? assertObjectId(linkedTaskIdRaw, 'linked_task_id') : null;
  const syncTaskStatus = pickBoolean(payload, 'syncTaskStatus', 'sync_task_status') ?? false;

  let initialStatus = 'pending';
  if (requestedStatus && GOAL_STATUSES.includes(requestedStatus) && requestedStatus !== 'deleted') {
    initialStatus = requestedStatus;
  } else if (targetValue != null && currentValue >= targetValue) {
    initialStatus = 'completed';
  } else if (currentValue > 0) {
    initialStatus = 'in_progress';
  }

  const goal = await goalRepository.createGoal({
    accountId,
    userId,
    dayId: day._id,
    dayKey,
    dueDate: pickString(payload, 'dueDate', 'due_date') || dayKey,
    type,
    title,
    description: pickString(payload, 'description'),
    category: pickString(payload, 'category'),
    targetValue: targetValue ?? null,
    currentValue: Math.max(0, currentValue),
    unit: pickString(payload, 'unit'),
    visibility,
    sourceType,
    sourceId: sourceId || (sourceType === 'task' ? linkedTaskId : null),
    linkedTaskId: linkedTaskId || (sourceType === 'task' ? sourceId : null),
    syncTaskStatus: syncTaskStatus || (sourceType === 'task' && Boolean(linkedTaskId || sourceId)),
    status: initialStatus,
    isPrivate: resolveGoalPrivacy(type, settings, visibility) ?? defaultGoalPrivacy(type),
    sortOrder: pickNumber(payload, 'sortOrder', 'sort_order') ?? 0,
    completedAt: initialStatus === 'completed' ? new Date() : null,
  });

  info('Daily Flow goal created', { accountId, goalId: String(goal._id), dayKey, type });
  return toGoalDto(goal);
}

async function updateGoal(accountId, goalId, payload = {}) {
  const existing = await getOwnedGoal(accountId, goalId);
  const updates = {};

  const title = pickString(payload, 'title');
  if (title) updates.title = title;

  const description = pickField(payload, 'description');
  if (description !== undefined) updates.description = pickString(payload, 'description');

  const category = pickField(payload, 'category');
  if (category !== undefined) updates.category = pickString(payload, 'category');

  const unit = pickField(payload, 'unit');
  if (unit !== undefined) updates.unit = pickString(payload, 'unit');

  const targetValue = pickNumber(payload, 'targetValue', 'target_value');
  if (targetValue !== undefined) updates.targetValue = targetValue;

  const sortOrder = pickNumber(payload, 'sortOrder', 'sort_order');
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;

  const status = pickString(payload, 'status');
  if (status) {
    if (!GOAL_STATUSES.includes(status) || status === 'deleted') {
      throw new AppError('Invalid goal status', {
        status: 400,
        code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_GOAL_STATUS,
      });
    }
    updates.status = status;
    if (status === 'completed') updates.completedAt = new Date();
  }

  const visibility = pickString(payload, 'visibility');
  if (visibility) {
    if (!GOAL_VISIBILITY.includes(visibility)) {
      throw new AppError('Invalid goal visibility', {
        status: 400,
        code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_GOAL_TYPE,
      });
    }
    if (existing.type === 'personal') {
      warn('Daily Flow ignoring visibility change on personal goal', { goalId });
    } else {
      const settings = await settingsService.getSettingsRecord(accountId);
      updates.visibility = visibility;
      updates.isPrivate = resolveGoalPrivacy(existing.type, settings, visibility);
    }
  }

  if (!Object.keys(updates).length) {
    return toGoalDto(existing);
  }

  const updated = await goalRepository.updateGoalById(existing._id, accountId, updates);
  info('Daily Flow goal updated', { accountId, goalId: String(existing._id) });
  return toGoalDto(updated);
}

async function updateGoalProgress(accountId, goalId, payload = {}) {
  const existing = await getOwnedGoal(accountId, goalId);
  const currentValue = pickNumber(payload, 'currentValue', 'current_value');

  if (currentValue === undefined) {
    throw new AppError('current_value is required', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_GOAL_STATUS,
      fields: { current_value: 'current_value is required' },
    });
  }

  if (currentValue < 0) {
    throw new AppError('current_value cannot be below 0', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_GOAL_STATUS,
      fields: { current_value: 'current_value cannot be below 0' },
    });
  }

  const updates = { currentValue };

  if (existing.targetValue != null && existing.targetValue > 0) {
    if (currentValue >= existing.targetValue) {
      updates.status = 'completed';
      updates.completedAt = new Date();
    } else if (existing.status === 'completed') {
      updates.status = 'in_progress';
      updates.completedAt = null;
    } else if (currentValue > 0) {
      updates.status = 'in_progress';
    } else {
      updates.status = 'pending';
    }
  } else if (currentValue > 0 && existing.status === 'pending') {
    updates.status = 'in_progress';
  }

  const updated = await goalRepository.updateGoalById(existing._id, accountId, updates);
  info('Daily Flow goal progress updated', {
    accountId,
    goalId: String(existing._id),
    currentValue,
    status: updated.status,
  });
  return toGoalDto(updated);
}

async function completeGoal(accountId, goalId) {
  const existing = await getOwnedGoal(accountId, goalId);

  if (existing.status === 'completed') {
    const dto = toGoalDto(existing);
    dto.task_sync = { synced: false, reason: 'already_completed' };
    return dto;
  }

  const updates = {
    status: 'completed',
    completedAt: new Date(),
  };

  if (existing.targetValue != null && existing.targetValue > 0) {
    updates.currentValue = Math.max(existing.currentValue || 0, existing.targetValue);
  }

  const updated = await goalRepository.updateGoalById(existing._id, accountId, updates);
  const syncResult = await taskSyncService.syncGoalCompletedToTask(updated, accountId);
  info('Daily Flow goal completed', {
    accountId,
    goalId: String(existing._id),
    taskSync: syncResult,
  });

  const dto = toGoalDto(updated);
  if (syncResult.synced || syncResult.reason) {
    dto.task_sync = syncResult;
  }
  return dto;
}

async function reopenGoal(accountId, goalId) {
  const existing = await getOwnedGoal(accountId, goalId);

  if (existing.status === 'pending' || existing.status === 'in_progress') {
    const dto = toGoalDto(existing);
    dto.task_sync = { synced: false, reason: 'already_open' };
    return dto;
  }

  if (existing.status !== 'completed') {
    throw new AppError('Only completed goals can be reopened', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_GOAL_STATUS,
    });
  }

  const nextStatus = existing.currentValue > 0 ? 'in_progress' : 'pending';
  const updated = await goalRepository.updateGoalById(existing._id, accountId, {
    status: nextStatus,
    completedAt: null,
  });

  const syncResult = await taskSyncService.syncGoalReopenedToTask(updated, accountId);
  await taskSyncService.markReportChangedAfterSubmission(accountId, existing.dayKey, existing._id);

  info('Daily Flow goal reopened', {
    accountId,
    goalId: String(existing._id),
    taskSync: syncResult,
  });

  const dto = toGoalDto(updated);
  if (syncResult.synced || syncResult.reason) {
    dto.task_sync = syncResult;
  }
  return dto;
}

async function deleteGoal(accountId, goalId) {
  const existing = await getOwnedGoal(accountId, goalId);
  const deleted = await goalRepository.softDeleteGoalById(existing._id, accountId);
  info('Daily Flow goal deleted', { accountId, goalId: String(existing._id) });
  return toGoalDto(deleted);
}

module.exports = {
  listGoals,
  createGoal,
  updateGoal,
  updateGoalProgress,
  completeGoal,
  reopenGoal,
  deleteGoal,
};
