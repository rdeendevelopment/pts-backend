const { AppError } = require('../../../kernel/errors');
const activityErrorCodes = require('../errors/activityErrorCodes');
const projectsModule = require('../../projects');
const { toProjectBudgetDto } = require('../../projects/dto/project.dto');
const {
  ensureApprovedCapacityCoversAssignments,
} = require('../../projects/helpers/assignmentCapacityBudget.helper');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const timeEntryRepository = require('../repositories/timeEntry.repository');
const timeWeekRepository = require('../repositories/timeWeek.repository');
const {
  accountHasManagePermission,
  canViewAllProjectTimeEntries,
  buildActivityUserScope,
} = require('../helpers/access.helper');
const userSummaryHelper = require('../helpers/userSummary.helper');
const {
  buildWeekDayKeys,
  formatDayKey,
  getWeekBounds,
} = require('../helpers/week.helper');
const { toTimeEntryDto } = require('../dto/activity.dto');

function toDateKey(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function parseEndDate(value) {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

async function getProjectSummary(projectId, query, req) {
  await projectsModule.getProjectForActivity(projectId, req);
  const stats = await projectsModule.getProjectStats(projectId);

  const entryFilters = buildActivityUserScope(req, query, { projectId });
  if (query.startDate || query.start_date) {
    entryFilters.entryDateFrom = new Date(query.startDate || query.start_date);
  }
  if (query.endDate || query.end_date) {
    entryFilters.entryDateTo = parseEndDate(query.endDate || query.end_date);
  }

  const targetUserId = entryFilters.userId || null;

  const entries = await timeEntryRepository.listEntries(entryFilters);
  const weekIds = [...new Set(entries.map((entry) => String(entry.timeWeekId)).filter(Boolean))];
  const weeks = await Promise.all(weekIds.map((id) => timeWeekRepository.findById(id)));
  const weekMap = new Map(weeks.filter(Boolean).map((week) => [String(week._id), week]));

  const weekTotals = new Map();
  for (const entry of entries) {
    const weekId = String(entry.timeWeekId);
    if (!weekTotals.has(weekId)) {
      weekTotals.set(weekId, {
        week: weekMap.get(weekId) || null,
        totalMinutes: 0,
        statusTotals: { draft: 0, submitted: 0, approved: 0, rejected: 0 },
      });
    }
    const row = weekTotals.get(weekId);
    row.totalMinutes += Number(entry.minutes || 0);
    row.statusTotals[entry.status] = (row.statusTotals[entry.status] || 0) + Number(entry.minutes || 0);
  }

  const assignment = await projectsModule.getAssignmentForUser(projectId, targetUserId);
  let userBreakdown = [];

  if (canViewAllProjectTimeEntries(req) && !targetUserId) {
    const assignments = await projectAssignmentRepository.listByProjectId(projectId, { status: 'active' });
    const userMap = await userSummaryHelper.resolveUsersByIds(assignments.map((row) => row.userId));
    userBreakdown = assignments.map((row) => {
      const summary = userMap.get(String(row.userId));
      return {
        ...(summary || { userId: String(row.userId) }),
        assignedMinutes: Number(row.allocation?.allocatedMinutes || 0),
        consumedMinutes: Number(row.stats?.consumedMinutes || 0),
        remainingMinutes: Number(row.stats?.remainingMinutes || 0),
      };
    });
  } else if (assignment) {
    const user = await require('../../users/repositories/user.repository').findById(targetUserId);
    userBreakdown = [{
      ...(userSummaryHelper.toUserSummaryDto(user) || { userId: String(targetUserId) }),
      assignedMinutes: Number(assignment.allocation?.allocatedMinutes || 0),
      consumedMinutes: Number(assignment.stats?.consumedMinutes || 0),
      remainingMinutes: Number(assignment.stats?.remainingMinutes || 0),
    }];
  }

  const currentWeekBounds = getWeekBounds(new Date());
  const currentWeekTotalMinutes = entries
    .filter((entry) => {
      const entryDate = new Date(entry.entryDate);
      return entryDate >= currentWeekBounds.weekStartDate && entryDate <= currentWeekBounds.weekEndDate;
    })
    .reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);

  const statusTotals = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
  for (const entry of entries) {
    statusTotals[entry.status] = (statusTotals[entry.status] || 0) + Number(entry.minutes || 0);
  }

  const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);
  const canViewAll = canViewAllProjectTimeEntries(req);
  const visibleStats = canViewAll
    ? {
      approvedMinutes: Number(stats?.totalApprovedMinutes || 0),
      assignedMinutes: Number(stats?.totalAssignedMinutes || 0),
      consumedMinutes: Number(stats?.totalConsumedMinutes || 0),
      remainingMinutes: Number(stats?.totalRemainingMinutes || 0),
      availableToAssignMinutes: Number(stats?.totalAvailableToAssignMinutes || 0),
    }
    : {
      approvedMinutes: Number(assignment?.allocation?.allocatedMinutes || 0),
      assignedMinutes: Number(assignment?.allocation?.allocatedMinutes || 0),
      consumedMinutes: Number(assignment?.stats?.consumedMinutes || 0),
      remainingMinutes: Number(assignment?.stats?.remainingMinutes || 0),
      availableToAssignMinutes: 0,
    };

  return {
    projectId: String(projectId),
    userId: targetUserId ? String(targetUserId) : null,
    ...visibleStats,
    totalMinutes,
    currentWeekTotalMinutes,
    statusTotals,
    userBreakdown,
    weeks: [...weekTotals.values()]
      .map((row) => ({
        weekId: row.week ? String(row.week._id) : null,
        weekStartDate: toDateKey(row.week?.weekStartDate),
        weekEndDate: toDateKey(row.week?.weekEndDate),
        status: row.week?.status || 'draft',
        totalMinutes: row.totalMinutes,
        statusTotals: row.statusTotals,
      }))
      .sort((a, b) => String(b.weekStartDate || '').localeCompare(String(a.weekStartDate || ''))),
  };
}

async function getProjectWeeklyActivity(projectId, query, req) {
  await projectsModule.getProjectForActivity(projectId, req);

  const anchorDate = query.weekStartDate || query.week_start || query.weekEnding || query.week_ending || new Date();
  const { weekStartDate, weekEndDate, timezone } = getWeekBounds(anchorDate);

  const entryFilters = buildActivityUserScope(req, query, {
    projectId,
    entryDateFrom: weekStartDate,
    entryDateTo: weekEndDate,
  });

  if (query.status) entryFilters.status = query.status;
  if (query.entryDateFrom) entryFilters.entryDateFrom = new Date(query.entryDateFrom);
  if (query.entryDateTo) entryFilters.entryDateTo = parseEndDate(query.entryDateTo);

  const entries = await timeEntryRepository.listEntries(entryFilters);
  const userMap = await userSummaryHelper.resolveUsersByIds(entries.map((entry) => entry.userId));
  const dayKeys = buildWeekDayKeys(weekStartDate, timezone);

  const days = dayKeys.map((date) => ({
    date,
    totalMinutes: 0,
    users: new Map(),
    entries: [],
  }));
  const dayIndex = new Map(dayKeys.map((key, index) => [key, index]));
  const userTotals = new Map();

  for (const entry of entries) {
    const dayKey = formatDayKey(entry.entryDate, timezone);
    const index = dayIndex.get(dayKey);
    if (index === undefined) continue;

    const day = days[index];
    const entryDto = toTimeEntryDto(entry);
    day.totalMinutes += Number(entry.minutes || 0);
    day.entries.push(entryDto);

    const uid = String(entry.userId);
    if (!day.users.has(uid)) {
      day.users.set(uid, {
        ...(userMap.get(uid) || { userId: uid }),
        totalMinutes: 0,
        entries: [],
      });
    }
    const userRow = day.users.get(uid);
    userRow.totalMinutes += Number(entry.minutes || 0);
    userRow.entries.push(entryDto);

    if (!userTotals.has(uid)) {
      userTotals.set(uid, {
        ...(userMap.get(uid) || { userId: uid }),
        totalMinutes: 0,
      });
    }
    userTotals.get(uid).totalMinutes += Number(entry.minutes || 0);
  }

  const totalMinutes = entries.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);

  return {
    projectId: String(projectId),
    weekStartDate: toDateKey(weekStartDate),
    weekEndDate: toDateKey(weekEndDate),
    totalMinutes,
    days: days.map((day) => ({
      date: day.date,
      totalMinutes: day.totalMinutes,
      users: [...day.users.values()],
      entries: day.entries,
    })),
    users: [...userTotals.values()],
    entries: entries.map(toTimeEntryDto),
  };
}

async function listProjectTimeEntries(projectId, query, req) {
  await projectsModule.getProjectForActivity(projectId, req);

  const entryFilters = buildActivityUserScope(req, query, { projectId });

  if (query.startDate || query.start_date) {
    entryFilters.entryDateFrom = new Date(query.startDate || query.start_date);
  }
  if (query.endDate || query.end_date) {
    entryFilters.entryDateTo = parseEndDate(query.endDate || query.end_date);
  }
  if (query.entryDateFrom) entryFilters.entryDateFrom = new Date(query.entryDateFrom);
  if (query.entryDateTo) entryFilters.entryDateTo = parseEndDate(query.entryDateTo);
  if (query.status) entryFilters.status = query.status;

  const entries = await timeEntryRepository.listEntries(entryFilters);
  const userMap = await userSummaryHelper.resolveUsersByIds(entries.map((entry) => entry.userId));

  return entries.map((entry) => {
    const dto = toTimeEntryDto(entry);
    const user = userMap.get(String(entry.userId));
    return {
      ...dto,
      user: user || null,
      userName: user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email
        : undefined,
    };
  });
}

async function listProjectBudgetsForActivity(projectId, req) {
  const project = await projectsModule.getProjectForActivity(projectId);

  if (!accountHasManagePermission(req)) {
    const assignment = await projectsModule.getAssignmentForUser(projectId, req.v2Activity.userId);
    if (!assignment) {
      throw new AppError('You are not assigned to this project', {
        status: 403,
        code: activityErrorCodes.ACTIVITY_FORBIDDEN,
      });
    }
  }

  let budgets = await projectsModule.getApprovedBudgetsForProject(projectId);
  if (budgets.length === 0) {
    await ensureApprovedCapacityCoversAssignments(project, req.v2Auth.accountId, req);
    budgets = await projectsModule.getApprovedBudgetsForProject(projectId);
  }

  return budgets
    .map(toProjectBudgetDto)
    .filter((budget) => budget && budget.lifecycleStatus !== 'consumed');
}

module.exports = {
  getProjectSummary,
  getProjectWeeklyActivity,
  listProjectTimeEntries,
  listProjectBudgetsForActivity,
};
