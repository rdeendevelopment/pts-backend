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
const taskRepository = require('../../tasks/repositories/task.repository');
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

const ENTRY_LIST_SELECT = [
  '_id',
  'timeWeekId',
  'projectId',
  'assignmentId',
  'userId',
  'taskId',
  'budgetId',
  'workCategoryId',
  'entryDate',
  'minutes',
  'description',
  'title',
  'status',
  'source',
  'billable',
  'startTime',
  'endTime',
  'createdAt',
].join(' ');

function toDateKey(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function parseEndDate(value) {
  const end = new Date(value);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function parsePositiveInt(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveTaskName(taskId, taskNameById) {
  if (!taskId) return 'General Activity';
  return taskNameById.get(String(taskId)) || 'Deleted Task';
}

async function buildTaskNameMap(taskIds = []) {
  const uniqueIds = [...new Set(taskIds.filter(Boolean).map(String))];
  if (!uniqueIds.length) return new Map();
  const tasks = await taskRepository.findTitlesByIds(uniqueIds);
  return new Map(tasks.map((task) => [
    String(task._id),
    task.isDeleted ? 'Deleted Task' : (task.title || 'Deleted Task'),
  ]));
}

async function getProjectSummary(projectId, query, req) {
  await projectsModule.getProjectForActivity(projectId, req);

  const entryFilters = buildActivityUserScope(req, query, { projectId });
  if (query.startDate || query.start_date) {
    entryFilters.entryDateFrom = new Date(query.startDate || query.start_date);
  }
  if (query.endDate || query.end_date) {
    entryFilters.entryDateTo = parseEndDate(query.endDate || query.end_date);
  }

  const targetUserId = entryFilters.userId || null;
  const weekLimit = parsePositiveInt(query.weekLimit ?? query.week_limit, null);
  const currentWeekBounds = getWeekBounds(new Date());

  const [stats, weekAggregates, currentWeekSum, assignment] = await Promise.all([
    projectsModule.getProjectStats(projectId),
    timeEntryRepository.aggregateWeekTotals(entryFilters),
    timeEntryRepository.sumMinutes({
      ...entryFilters,
      entryDateFrom: currentWeekBounds.weekStartDate,
      entryDateTo: currentWeekBounds.weekEndDate,
    }),
    targetUserId
      ? projectsModule.getAssignmentForUser(projectId, targetUserId)
      : Promise.resolve(null),
  ]);

  const weekIds = weekAggregates.map((row) => row.timeWeekId).filter(Boolean);
  const weeks = await timeWeekRepository.findByIds(weekIds);
  const weekMap = new Map(weeks.filter(Boolean).map((week) => [String(week._id), week]));

  const statusTotals = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
  let totalMinutes = 0;
  for (const row of weekAggregates) {
    totalMinutes += Number(row.totalMinutes || 0);
    for (const status of Object.keys(statusTotals)) {
      statusTotals[status] += Number(row.statusTotals?.[status] || 0);
    }
  }

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
    const assignedMinutes = Number(assignment.allocation?.allocatedMinutes || 0);
    // Prefer live entry totals over possibly stale assignment.stats.consumedMinutes
    const consumedMinutes = Math.max(
      Number(assignment.stats?.consumedMinutes || 0),
      totalMinutes,
    );
    const remainingMinutes = assignedMinutes > 0
      ? Math.max(0, assignedMinutes - consumedMinutes)
      : Number(assignment.stats?.remainingMinutes || 0);
    userBreakdown = [{
      ...(userSummaryHelper.toUserSummaryDto(user) || { userId: String(targetUserId) }),
      assignedMinutes,
      consumedMinutes,
      remainingMinutes,
    }];
  }

  const canViewAll = canViewAllProjectTimeEntries(req);
  const allocatedMinutes = canViewAll
    ? Number(stats?.totalAssignedMinutes || 0)
    : Number(assignment?.allocation?.allocatedMinutes || 0);
  const loggedMinutes = canViewAll && !targetUserId
    ? Math.max(Number(stats?.totalConsumedMinutes || 0), totalMinutes)
    : Math.max(
      Number(assignment?.stats?.consumedMinutes || 0),
      Number(userBreakdown[0]?.consumedMinutes || 0),
      totalMinutes,
    );
  const remainingMinutes = allocatedMinutes > 0
    ? Math.max(0, allocatedMinutes - loggedMinutes)
    : (canViewAll
      ? Number(stats?.totalRemainingMinutes || 0)
      : Math.max(0, Number(assignment?.stats?.remainingMinutes || 0)));
  const usagePercent = allocatedMinutes > 0
    ? Math.min(100, Math.round((loggedMinutes / allocatedMinutes) * 100))
    : 0;

  const visibleStats = canViewAll && !targetUserId
    ? {
      approvedMinutes: Number(stats?.totalApprovedMinutes || 0),
      assignedMinutes: Number(stats?.totalAssignedMinutes || 0),
      consumedMinutes: loggedMinutes,
      remainingMinutes,
      availableToAssignMinutes: Number(stats?.totalAvailableToAssignMinutes || 0),
    }
    : {
      approvedMinutes: allocatedMinutes,
      assignedMinutes: allocatedMinutes,
      consumedMinutes: loggedMinutes,
      remainingMinutes,
      availableToAssignMinutes: 0,
    };

  const allWeeks = weekAggregates
    .map((row) => {
      const week = weekMap.get(String(row.timeWeekId)) || null;
      return {
        weekId: week ? String(week._id) : (row.timeWeekId ? String(row.timeWeekId) : null),
        weekStartDate: toDateKey(week?.weekStartDate),
        weekEndDate: toDateKey(week?.weekEndDate),
        status: week?.status || 'draft',
        totalMinutes: row.totalMinutes,
        statusTotals: row.statusTotals,
      };
    })
    .sort((a, b) => String(b.weekStartDate || '').localeCompare(String(a.weekStartDate || '')));

  const limitedWeeks = weekLimit ? allWeeks.slice(0, weekLimit) : allWeeks;

  return {
    projectId: String(projectId),
    userId: targetUserId ? String(targetUserId) : null,
    ...visibleStats,
    // Explicit usage contract for Overview KPIs
    loggedMinutes,
    allocatedMinutes,
    usagePercent,
    totalMinutes,
    currentWeekTotalMinutes: Number(currentWeekSum?.totalMinutes || 0),
    statusTotals,
    userBreakdown,
    weeksTotal: allWeeks.length,
    hasMoreWeeks: Boolean(weekLimit && allWeeks.length > weekLimit),
    weeks: limitedWeeks,
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

  const entries = await timeEntryRepository.listEntries(entryFilters, {
    lean: true,
    select: ENTRY_LIST_SELECT,
  });
  const taskIds = entries.map((entry) => entry.taskId).filter(Boolean);
  const [userMap, taskNameById] = await Promise.all([
    userSummaryHelper.resolveUsersByIds(entries.map((entry) => entry.userId)),
    buildTaskNameMap(taskIds),
  ]);
  const toEnrichedEntryDto = (entry) => ({
    ...toTimeEntryDto(entry),
    taskName: resolveTaskName(entry.taskId, taskNameById),
  });
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
    const entryDto = toEnrichedEntryDto(entry);
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
    entries: entries.map(toEnrichedEntryDto),
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

  const limit = parsePositiveInt(query.limit, 50);

  const entries = await timeEntryRepository.listEntries(entryFilters, {
    lean: true,
    select: ENTRY_LIST_SELECT,
    limit,
    // Activity feeds need newest-first; ascending + limit returned oldest rows only.
    sort: { entryDate: -1, createdAt: -1 },
  });
  const [userMap, taskNameById] = await Promise.all([
    userSummaryHelper.resolveUsersByIds(entries.map((entry) => entry.userId)),
    buildTaskNameMap(entries.map((entry) => entry.taskId)),
  ]);

  return entries.map((entry) => {
    const dto = toTimeEntryDto(entry);
    const user = userMap.get(String(entry.userId));
    return {
      ...dto,
      taskName: resolveTaskName(entry.taskId, taskNameById),
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
