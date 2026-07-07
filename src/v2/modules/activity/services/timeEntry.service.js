const { AppError } = require('../../../kernel/errors');
const activityErrorCodes = require('../errors/activityErrorCodes');
const timeEntryRepository = require('../repositories/timeEntry.repository');
const timeValidationService = require('./timeValidation.service');
const timeWeekService = require('./timeWeek.service');
const {
  assertOwnUserOrManage,
  assertOwnUserOrViewAll,
  buildActivityUserScope,
} = require('../helpers/access.helper');
const { toTimeEntryDto } = require('../dto/activity.dto');

async function getEntryOrThrow(entryId) {
  const entry = await timeEntryRepository.findById(entryId);
  if (!entry) {
    throw new AppError('Time entry not found', {
      status: 404,
      code: activityErrorCodes.ACTIVITY_ENTRY_NOT_FOUND,
    });
  }
  return entry;
}

function assertEntryEditable(entry) {
  if (entry.isLocked || ['submitted', 'approved'].includes(entry.status)) {
    throw new AppError('Time entry is locked', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_WEEK_LOCKED,
      details: { status: entry.status },
    });
  }
}

function applyEntryDateFilters(filters, query) {
  if (query.entryDateFrom) {
    filters.entryDateFrom = new Date(query.entryDateFrom);
  } else if (query.startDate || query.start_date) {
    filters.entryDateFrom = new Date(query.startDate || query.start_date);
  }
  if (query.entryDateTo) {
    const end = new Date(query.entryDateTo);
    end.setUTCHours(23, 59, 59, 999);
    filters.entryDateTo = end;
  } else if (query.endDate || query.end_date) {
    const end = new Date(query.endDate || query.end_date);
    end.setUTCHours(23, 59, 59, 999);
    filters.entryDateTo = end;
  }
}

async function listEntries(query, req) {
  const baseFilters = {};
  const projectId = query.project_id || query.projectId || null;
  if (query.time_week_id || query.timeWeekId) {
    baseFilters.timeWeekId = query.time_week_id || query.timeWeekId;
  }
  if (projectId) baseFilters.projectId = projectId;
  const filters = buildActivityUserScope(req, query, baseFilters);

  if (query.status) filters.status = query.status;
  applyEntryDateFilters(filters, query);

  const entries = await timeEntryRepository.listEntries(filters);
  return entries.map(toTimeEntryDto);
}

async function getEntryById(entryId, req) {
  const entry = await getEntryOrThrow(entryId);
  assertOwnUserOrViewAll(req, entry.userId);
  return toTimeEntryDto(entry);
}

async function createEntry(payload, accountId, req) {
  const userId = payload.userId || req.v2Activity.userId;
  assertOwnUserOrManage(req, userId);

  const entryDate = new Date(payload.entryDate || payload.entry_date || new Date());
  const minutes = Number(payload.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new AppError('minutes must be greater than 0', { status: 400, code: activityErrorCodes.ACTIVITY_ENTRY_NOT_FOUND });
  }

  const week = payload.timeWeekId
    ? await timeWeekService.getWeekOrThrow(payload.timeWeekId)
    : await timeWeekService.getOrCreateWeek(userId, entryDate, accountId);

  if (week.status === 'approved') {
    throw new AppError('Approved week cannot accept new entries', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_WEEK_LOCKED,
    });
  }

  await timeValidationService.validateTimeEntry({
    projectId: payload.projectId,
    userId,
    assignmentId: payload.assignmentId,
    budgetId: payload.budgetId,
    workCategoryId: payload.workCategoryId,
    entryDate,
    minutes,
    source: payload.source || 'manual',
    timeWeek: week,
    throwOnError: true,
  });

  const assignment = await require('../../projects').getAssignmentForUser(payload.projectId, userId);

  const entry = await timeEntryRepository.createEntry({
    timeWeekId: week._id,
    projectId: payload.projectId,
    assignmentId: assignment._id,
    userId,
    budgetId: payload.budgetId || null,
    taskId: payload.taskId || null,
    workCategoryId: payload.workCategoryId,
    entryDate,
    startTime: payload.startTime ? new Date(payload.startTime) : null,
    endTime: payload.endTime ? new Date(payload.endTime) : null,
    minutes,
    title: payload.title || null,
    description: payload.description || null,
    source: payload.source || 'manual',
    status: 'draft',
    billable: payload.billable !== false,
    createdBy: accountId,
    updatedBy: accountId,
  });

  await require('../repositories/timeWeek.repository').recalculateWeekTotals(week._id);

  return toTimeEntryDto(entry);
}

async function updateEntry(entryId, payload, accountId, req) {
  const entry = await getEntryOrThrow(entryId);
  assertOwnUserOrManage(req, entry.userId);
  assertEntryEditable(entry);

  const week = await timeWeekService.getWeekOrThrow(entry.timeWeekId);
  const nextMinutes = payload.minutes !== undefined ? Number(payload.minutes) : entry.minutes;
  const nextEntryDate = payload.entryDate ? new Date(payload.entryDate) : entry.entryDate;

  await timeValidationService.validateTimeEntry({
    projectId: payload.projectId || entry.projectId,
    userId: entry.userId,
    assignmentId: payload.assignmentId || entry.assignmentId,
    budgetId: payload.budgetId !== undefined ? payload.budgetId : entry.budgetId,
    workCategoryId: payload.workCategoryId || entry.workCategoryId,
    entryDate: nextEntryDate,
    minutes: nextMinutes,
    source: entry.source,
    timeWeek: week,
    excludeEntryId: entry._id,
    throwOnError: true,
  });

  const updates = {
    minutes: nextMinutes,
    entryDate: nextEntryDate,
    updatedBy: accountId,
  };
  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.budgetId !== undefined) updates.budgetId = payload.budgetId;
  if (payload.workCategoryId !== undefined) updates.workCategoryId = payload.workCategoryId;
  if (payload.billable !== undefined) updates.billable = Boolean(payload.billable);

  const updated = await timeEntryRepository.updateEntry(entry._id, updates, null, { expectedStatus: 'draft' });
  await require('../repositories/timeWeek.repository').recalculateWeekTotals(entry.timeWeekId);
  return toTimeEntryDto(updated);
}

async function deleteEntry(entryId, accountId, req) {
  const entry = await getEntryOrThrow(entryId);
  assertOwnUserOrManage(req, entry.userId);
  assertEntryEditable(entry);

  await timeEntryRepository.softDeleteEntry(entry._id, accountId);
  await require('../repositories/timeWeek.repository').recalculateWeekTotals(entry.timeWeekId);
  return { deleted: true, id: String(entryId) };
}

async function previewValidation(payload, req) {
  const userId = payload.userId || req.v2Activity.userId;
  assertOwnUserOrManage(req, userId);

  const week = payload.timeWeekId
    ? await timeWeekService.getWeekOrThrow(payload.timeWeekId)
    : null;

  return timeValidationService.validateTimeEntry({
    projectId: payload.projectId,
    userId,
    assignmentId: payload.assignmentId,
    budgetId: payload.budgetId,
    workCategoryId: payload.workCategoryId,
    entryDate: payload.entryDate || new Date(),
    minutes: payload.minutes || 0,
    source: payload.source || 'manual',
    timeWeek: week,
    throwOnError: false,
  });
}

module.exports = {
  listEntries,
  getEntryById,
  createEntry,
  updateEntry,
  deleteEntry,
  previewValidation,
};
