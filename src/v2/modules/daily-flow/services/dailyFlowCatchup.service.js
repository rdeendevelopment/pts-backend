const { AppError } = require('../../../kernel/errors');
const { info } = require('../../../kernel/logger');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const {
  CATCHUP_TYPES,
  CATCHUP_STATUSES,
  CATCHUP_PRIORITIES,
} = require('../constants/dailyFlow.constants');
const catchupRepository = require('../repositories/dailyFlowCatchup.repository');
const { toCatchupDto } = require('../dto/dailyFlow.dto');
const { assertValidDayKey } = require('../helpers/dayKey.helper');
const { resolveUserIdForAccount } = require('../helpers/account.helper');
const { pickString, pickField } = require('../helpers/payload.helper');
const { parseListLimit } = require('../helpers/pagination.helper');
const dayService = require('./dailyFlowDay.service');

async function getOwnedCatchup(accountId, catchupId) {
  const normalizedId = assertObjectId(catchupId, 'catchup_id');
  const catchup = await catchupRepository.findCatchupById(normalizedId, accountId);

  if (!catchup) {
    throw new AppError('Daily Flow catchup not found', {
      status: 404,
      code: dailyFlowErrorCodes.DAILY_FLOW_CATCHUP_NOT_FOUND,
    });
  }

  return catchup;
}

async function listCatchups(accountId, query = {}) {
  info('Daily Flow listCatchups called', { accountId, query });

  const filters = { accountId };
  if (query.day_key || query.dayKey) {
    filters.dayKey = assertValidDayKey(query.day_key || query.dayKey);
  }
  if (query.type) filters.type = query.type;
  if (query.status) filters.status = query.status;

  const { items, total } = await catchupRepository.listCatchups(filters, {
    limit: parseListLimit(query.limit, 50, 200),
    skip: Number(query.skip) || 0,
  });

  return {
    items: items.map(toCatchupDto),
    total,
  };
}

async function createCatchup(accountId, payload = {}) {
  const dayKey = assertValidDayKey(payload.day_key || payload.dayKey);
  const type = String(payload.type || '').toLowerCase();
  const title = pickString(payload, 'title');

  if (!CATCHUP_TYPES.includes(type)) {
    throw new AppError('Invalid catchup type', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_CATCHUP_TYPE,
      details: { allowed: CATCHUP_TYPES },
    });
  }

  if (!title) {
    throw new AppError('Catchup title is required', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_CATCHUP_TYPE,
      fields: { title: 'title is required' },
    });
  }

  const priority = pickString(payload, 'priority') || 'medium';
  if (!CATCHUP_PRIORITIES.includes(priority)) {
    throw new AppError('Invalid catchup priority', {
      status: 400,
      code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_CATCHUP_TYPE,
      fields: { priority: `priority must be one of: ${CATCHUP_PRIORITIES.join(', ')}` },
    });
  }

  const userId = await resolveUserIdForAccount(accountId);
  const day = await dayService.getOrCreateDay(accountId, dayKey);

  const linkedProjectRaw = pickString(payload, 'linkedProjectId', 'linked_project_id');
  const linkedTaskRaw = pickString(payload, 'linkedTaskId', 'linked_task_id');

  const catchup = await catchupRepository.createCatchup({
    accountId,
    userId,
    dayId: day._id,
    dayKey,
    type,
    title,
    description: pickString(payload, 'description'),
    priority,
    dueDate: pickString(payload, 'dueDate', 'due_date'),
    linkedProjectId: linkedProjectRaw ? assertObjectId(linkedProjectRaw, 'linked_project_id') : null,
    linkedTaskId: linkedTaskRaw ? assertObjectId(linkedTaskRaw, 'linked_task_id') : null,
    status: 'open',
  });

  info('Daily Flow catchup created', { accountId, catchupId: String(catchup._id), dayKey });
  return toCatchupDto(catchup);
}

async function updateCatchup(accountId, catchupId, payload = {}) {
  const existing = await getOwnedCatchup(accountId, catchupId);
  const updates = {};

  const title = pickString(payload, 'title');
  if (title) updates.title = title;

  const description = pickField(payload, 'description');
  if (description !== undefined) updates.description = pickString(payload, 'description');

  const type = pickString(payload, 'type');
  if (type) {
    if (!CATCHUP_TYPES.includes(type)) {
      throw new AppError('Invalid catchup type', {
        status: 400,
        code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_CATCHUP_TYPE,
      });
    }
    updates.type = type;
  }

  const priority = pickString(payload, 'priority');
  if (priority) {
    if (!CATCHUP_PRIORITIES.includes(priority)) {
      throw new AppError('Invalid catchup priority', {
        status: 400,
        code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_CATCHUP_TYPE,
      });
    }
    updates.priority = priority;
  }

  const dueDate = pickField(payload, 'dueDate', 'due_date');
  if (dueDate !== undefined) updates.dueDate = pickString(payload, 'dueDate', 'due_date');

  const status = pickString(payload, 'status');
  if (status) {
    if (!CATCHUP_STATUSES.includes(status)) {
      throw new AppError('Invalid catchup status', {
        status: 400,
        code: dailyFlowErrorCodes.DAILY_FLOW_INVALID_CATCHUP_STATUS,
      });
    }
    updates.status = status;
  }

  if (!Object.keys(updates).length) {
    return toCatchupDto(existing);
  }

  const updated = await catchupRepository.updateCatchupById(existing._id, accountId, updates);
  info('Daily Flow catchup updated', { accountId, catchupId: String(existing._id) });
  return toCatchupDto(updated);
}

async function resolveCatchup(accountId, catchupId) {
  const existing = await getOwnedCatchup(accountId, catchupId);
  const updated = await catchupRepository.updateCatchupById(existing._id, accountId, {
    status: 'done',
    resolvedAt: new Date(),
  });

  info('Daily Flow catchup resolved', { accountId, catchupId: String(existing._id) });
  return toCatchupDto(updated);
}

async function deleteCatchup(accountId, catchupId) {
  const existing = await getOwnedCatchup(accountId, catchupId);
  const deleted = await catchupRepository.softDeleteCatchupById(existing._id, accountId);
  info('Daily Flow catchup deleted', { accountId, catchupId: String(existing._id) });
  return toCatchupDto(deleted);
}

module.exports = {
  listCatchups,
  createCatchup,
  updateCatchup,
  resolveCatchup,
  deleteCatchup,
};
