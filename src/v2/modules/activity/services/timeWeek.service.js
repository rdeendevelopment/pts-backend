const { AppError } = require('../../../kernel/errors');
const activityErrorCodes = require('../errors/activityErrorCodes');
const projectsModule = require('../../projects');
const timeWeekRepository = require('../repositories/timeWeek.repository');
const timeEntryRepository = require('../repositories/timeEntry.repository');
const activeTimerRepository = require('../repositories/activeTimer.repository');
const timeValidationService = require('./timeValidation.service');
const counterConsumptionService = require('./counterConsumption.service');
const { getWeekBounds } = require('../helpers/week.helper');
const {
  assertOwnUserOrManage,
  assertOwnUserOrViewAll,
  accountHasManagePermission,
  canViewAllProjectTimeEntries,
  buildActivityUserScope,
} = require('../helpers/access.helper');
const userSummaryHelper = require('../helpers/userSummary.helper');
const {
  toTimeWeekDto,
  buildWeeklyReport,
} = require('../dto/activity.dto');
const activitySocketEvents = require('../helpers/activitySocketEvents.helper');
const taskNotificationService = require('../../tasks/services/taskNotification.service');

async function getWeekOrThrow(weekId) {
  const week = await timeWeekRepository.findById(weekId);
  if (!week) {
    throw new AppError('Time week not found', {
      status: 404,
      code: activityErrorCodes.ACTIVITY_WEEK_NOT_FOUND,
    });
  }
  return week;
}

async function getOrCreateWeek(userId, dateInput, accountId) {
  const { weekStartDate, weekEndDate, timezone } = getWeekBounds(dateInput);

  let week = await timeWeekRepository.findByUserAndWeekStart(userId, weekStartDate);
  if (week) return week;

  week = await timeWeekRepository.createWeek({
    userId,
    weekStartDate,
    weekEndDate,
    timezone,
    status: 'draft',
    createdBy: accountId,
    updatedBy: accountId,
  });

  return week;
}

function parseEndDate(value) {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function applyWeekListDateFilters(filters, query) {
  if (query.week_start || query.weekStartDate) {
    filters.weekStartDate = query.week_start || query.weekStartDate;
    return;
  }
  if (query.startDate || query.start_date) {
    filters.weekStartDateFrom = new Date(query.startDate || query.start_date);
  }
  if (query.endDate || query.end_date) {
    filters.weekStartDateTo = parseEndDate(query.endDate || query.end_date);
  }
  if (query.weekStartDateFrom) filters.weekStartDateFrom = new Date(query.weekStartDateFrom);
  if (query.weekStartDateTo) filters.weekStartDateTo = parseEndDate(query.weekStartDateTo);
}

async function listWeeks(query, req) {
  const filters = buildActivityUserScope(req, query);
  if (query.status && query.status !== 'all') filters.status = query.status;
  applyWeekListDateFilters(filters, query);

  const weeks = await timeWeekRepository.listWeeks(filters);
  const dtos = weeks.map(toTimeWeekDto);

  if (!canViewAllProjectTimeEntries(req)) {
    return dtos;
  }

  const userMap = await userSummaryHelper.resolveUsersByIds(weeks.map((week) => week.userId));
  return dtos.map((dto) => ({
    ...dto,
    user: userMap.get(String(dto.userId)) || null,
  }));
}

async function attachWeekUserSummary(weekDto, weekDoc) {
  const userMap = await userSummaryHelper.resolveUsersByIds([weekDoc.userId]);
  return {
    ...weekDto,
    user: userMap.get(String(weekDoc.userId)) || null,
  };
}

async function getWeekById(weekId, req) {
  const week = await getWeekOrThrow(weekId);
  assertOwnUserOrViewAll(req, week.userId);

  const entries = await timeEntryRepository.listEntries({ timeWeekId: week._id });
  const report = buildWeeklyReport(entries, {
    weekStartDate: week.weekStartDate,
    timezone: week.timezone,
  });

  const base = toTimeWeekDto(week);
  const shouldEnrichUser = accountHasManagePermission(req)
    && String(week.userId) !== String(req.v2Activity.userId);
  const payload = shouldEnrichUser
    ? await attachWeekUserSummary(base, week)
    : base;

  return {
    ...payload,
    report,
  };
}

async function createWeek(payload, accountId, req) {
  const userId = payload.userId || req.v2Activity.userId;
  assertOwnUserOrManage(req, userId);

  const week = await getOrCreateWeek(userId, payload.entryDate || payload.weekStartDate || new Date(), accountId);
  return toTimeWeekDto(week);
}

async function submitWeek(weekId, accountId, req) {
  const week = await getWeekOrThrow(weekId);
  assertOwnUserOrManage(req, week.userId);

  if (week.status !== 'draft' && week.status !== 'rejected') {
    throw new AppError('Only draft or rejected weeks can be submitted', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_WEEK_INVALID_STATUS,
      details: { status: week.status },
    });
  }

  const runningTimer = await activeTimerRepository.findRunningByUserId(week.userId);
  if (runningTimer) {
    throw new AppError('Stop the running timer before submitting the week', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_TIMER_ALREADY_RUNNING,
    });
  }

  const entries = await timeEntryRepository.listEntries({ timeWeekId: week._id, statuses: ['draft'] });
  if (!entries.length) {
    throw new AppError('Cannot submit an empty week', {
      status: 400,
      code: activityErrorCodes.ACTIVITY_WEEK_INVALID_STATUS,
    });
  }

  for (const entry of entries) {
    await timeValidationService.validateTimeEntry({
      projectId: entry.projectId,
      userId: entry.userId,
      assignmentId: entry.assignmentId,
      budgetId: entry.budgetId,
      workCategoryId: entry.workCategoryId,
      entryDate: entry.entryDate,
      minutes: entry.minutes,
      source: entry.source,
      timeWeek: week,
      excludeEntryId: entry._id,
      throwOnError: true,
    });
  }

  await counterConsumptionService.withOptionalTransaction(async (session) => {
    await counterConsumptionService.consumeWeekEntries(week._id, session);

    await timeEntryRepository.updateManyByWeek(
      week._id,
      { status: 'submitted', updatedBy: accountId },
      session,
      { statuses: ['draft'] }
    );

    await timeWeekRepository.updateWeek(
      week._id,
      {
        status: 'submitted',
        submittedAt: new Date(),
        submittedBy: accountId,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null,
        updatedBy: accountId,
      },
      session,
      { expectedStatus: week.status === 'rejected' ? 'rejected' : 'draft' }
    );

    await timeWeekRepository.recalculateWeekTotals(week._id, session);
  });

  for (const projectId of [...new Set(entries.map((entry) => String(entry.projectId)))]) {
    await projectsModule.emitProjectEvent({
      projectId,
      eventType: 'ACTIVITY_WEEK_SUBMITTED',
      title: 'Activity week submitted',
      performedBy: accountId,
      metadata: { weekId: String(week._id), totalMinutes: week.totalMinutes },
    });
  }

  const result = await getWeekById(weekId, req);
  const projectIds = [...new Set(entries.map((entry) => String(entry.projectId)))];
  activitySocketEvents.emitActivityWeekSubmitted(result, projectIds);
  await taskNotificationService.notifyAdmins({
    type: 'activity_week_submitted',
    title: 'Week submitted for review',
    message: `${req.v2Auth?.displayName || 'A team member'} submitted ${result.weekStartDate} - ${result.weekEndDate}`,
    entityType: 'activity_week',
    entityId: String(result.id || week._id),
    activityId: String(result.id || week._id),
    projectId: projectIds[0] || null,
    actorId: accountId,
    actorName: req.v2Auth?.displayName || '',
    priority: 'normal',
    link: '/admin/manage-activity/team-activity',
  });
  return result;
}

async function approveWeek(weekId, accountId, req) {
  const week = await getWeekOrThrow(weekId);

  if (week.status !== 'submitted') {
    throw new AppError('Only submitted weeks can be approved', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_WEEK_NOT_SUBMITTED,
      details: { status: week.status },
    });
  }

  const now = new Date();

  await timeEntryRepository.updateManyByWeek(
    week._id,
    {
      status: 'approved',
      isLocked: true,
      lockedAt: now,
      approvedAt: now,
      approvedBy: accountId,
      updatedBy: accountId,
    },
    null,
    { statuses: ['submitted'] }
  );

  const updated = await timeWeekRepository.updateWeek(
    week._id,
    {
      status: 'approved',
      approvedAt: now,
      approvedBy: accountId,
      lockedAt: now,
      updatedBy: accountId,
    },
    null,
    { expectedStatus: 'submitted' }
  );

  const entries = await timeEntryRepository.listEntries({ timeWeekId: week._id });
  const result = await getWeekById(updated._id, req);
  const projectIds = [...new Set(entries.map((entry) => String(entry.projectId)))];
  activitySocketEvents.emitActivityWeekApproved(result, projectIds);
  await taskNotificationService.createAndEmitNotification({
    userId: week.userId,
    type: 'activity_week_approved',
    title: 'Week approved',
    message: `${req.v2Auth?.displayName || 'Admin'} approved your week ${result.weekStartDate} - ${result.weekEndDate}`,
    entityType: 'activity_week',
    entityId: String(result.id || week._id),
    activityId: String(result.id || week._id),
    projectId: projectIds[0] || null,
    actorId: accountId,
    actorName: req.v2Auth?.displayName || '',
    priority: 'normal',
    link: '/user/manage-activity/view-timesheet',
  });
  return result;
}

async function rejectWeek(weekId, accountId, req, rejectionReason = null) {
  const week = await getWeekOrThrow(weekId);

  if (week.status !== 'submitted') {
    throw new AppError('Only submitted weeks can be rejected', {
      status: 409,
      code: activityErrorCodes.ACTIVITY_WEEK_NOT_SUBMITTED,
      details: { status: week.status },
    });
  }

  await counterConsumptionService.withOptionalTransaction(async (session) => {
    await counterConsumptionService.reverseWeekEntries(week._id, session);

    await timeEntryRepository.updateManyByWeek(
      week._id,
      {
        status: 'draft',
        isLocked: false,
        lockedAt: null,
        rejectedAt: new Date(),
        rejectedBy: accountId,
        rejectionReason: rejectionReason || null,
        updatedBy: accountId,
      },
      session,
      { statuses: ['submitted'] }
    );

    await timeWeekRepository.updateWeek(
      week._id,
      {
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: accountId,
        rejectionReason: rejectionReason || null,
        updatedBy: accountId,
      },
      session,
      { expectedStatus: 'submitted' }
    );

    await timeWeekRepository.recalculateWeekTotals(week._id, session);
  });

  const entries = await timeEntryRepository.listEntries({ timeWeekId: week._id });
  const result = await getWeekById(weekId, req);
  const projectIds = [...new Set(entries.map((entry) => String(entry.projectId)))];
  activitySocketEvents.emitActivityWeekRejected(result, projectIds);
  await taskNotificationService.createAndEmitNotification({
    userId: week.userId,
    type: 'activity_week_rejected',
    title: 'Week needs changes',
    message: `${req.v2Auth?.displayName || 'Admin'} rejected your week ${result.weekStartDate} - ${result.weekEndDate}`,
    entityType: 'activity_week',
    entityId: String(result.id || week._id),
    activityId: String(result.id || week._id),
    projectId: projectIds[0] || null,
    actorId: accountId,
    actorName: req.v2Auth?.displayName || '',
    priority: 'high',
    link: '/user/manage-activity/view-timesheet',
    metadata: { rejectionReason: rejectionReason || null },
  });
  return result;
}

module.exports = {
  getWeekOrThrow,
  getOrCreateWeek,
  listWeeks,
  getWeekById,
  createWeek,
  submitWeek,
  approveWeek,
  rejectWeek,
};
