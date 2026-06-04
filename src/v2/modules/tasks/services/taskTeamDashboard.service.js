const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { getTaskModel } = require('../models/task.model');
const { getTaskWorkflowStatusModel } = require('../models/taskWorkflowStatus.model');
const { getProjectModel } = require('../../projects/models/project.model');
const { getClientModel } = require('../../clients/models/client.model');
const { getUserModel } = require('../../users/models/user.model');
const timeEntryRepository = require('../../activity/repositories/timeEntry.repository');
const { canManageTasks, resolveUserIdFromAuth } = require('../helpers/taskAccessScope.helper');
const userSummaryHelper = require('../../activity/helpers/userSummary.helper');
const { parsePagination, buildPaginationMeta } = require('../helpers/taskAggregateQuery.helper');
const taskErrorCodes = require('../errors/taskErrorCodes');

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

function endOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}

function parseDateRange(query = {}) {
  const fromRaw = query.startDate || query.start_date || query.from;
  const toRaw = query.endDate || query.end_date || query.to;
  const range = {};

  if (fromRaw) {
    const d = new Date(fromRaw);
    if (!Number.isNaN(d.getTime())) range.from = d;
  }
  if (toRaw) {
    const d = new Date(toRaw);
    if (!Number.isNaN(d.getTime())) range.to = d;
  }

  return range;
}

function normalizeSearch(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  return s;
}

function buildRegexSearch(term) {
  const t = normalizeSearch(term);
  if (!t) return null;
  return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function resolveTeamScope(req) {
  const accountType = req?.v2Auth?.account?.accountType || null;
  const isAdmin = canManageTasks(req) || accountType === 'admin' || accountType === 'super_admin';
  const requesterUserId = await resolveUserIdFromAuth(req.v2Auth.accountId);

  // Managers can access team dashboards, but only for direct reports (plus self).
  if (!isAdmin && accountType !== 'manager') {
    throw new AppError('Team dashboard access required', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
  }

  if (accountType === 'manager' && !isAdmin) {
    const User = getUserModel();
    const directReports = await User.find({
      isDeleted: false,
      managerId: requesterUserId,
    }).select('_id').lean();
    const teamUserIds = [...directReports.map((u) => String(u._id)), String(requesterUserId)];
    return { isAdmin: false, requesterUserId, teamUserIds };
  }

  return { isAdmin: true, requesterUserId, teamUserIds: null };
}

async function resolveUserIdsByDepartment(department) {
  const dept = String(department || '').trim();
  if (!dept) return null;
  const User = getUserModel();
  const users = await User.find({ isDeleted: false, department: dept }).select('_id').lean();
  return users.map((u) => String(u._id));
}

async function resolveProjectIdsByClient(clientId) {
  if (!clientId) return null;
  const id = assertObjectId(clientId, 'clientId');
  const Project = getProjectModel();
  const rows = await Project.find({ isDeleted: false, clientId: id }).select('_id').lean();
  return rows.map((p) => String(p._id));
}

function buildTaskMatch(filters = {}) {
  const match = { isDeleted: false, status: { $ne: 'archived' } };

  if (filters.status) match.status = String(filters.status);
  if (filters.priority) match.priority = String(filters.priority);
  if (filters.projectIds?.length) match.projectId = { $in: filters.projectIds };
  if (filters.projectId) match.projectId = assertObjectId(filters.projectId, 'projectId');

  if (filters.assigneeUserId) {
    match['assignees.userId'] = assertObjectId(filters.assigneeUserId, 'assigneeUserId');
  } else if (filters.teamUserIds?.length) {
    match['assignees.userId'] = { $in: filters.teamUserIds.map((id) => assertObjectId(id, 'teamUserId')) };
  }

  const dueFrom = filters.dueDateFrom ? new Date(filters.dueDateFrom) : null;
  const dueTo = filters.dueDateTo ? new Date(filters.dueDateTo) : null;
  if (dueFrom || dueTo) {
    match.dueDate = {};
    if (dueFrom && !Number.isNaN(dueFrom.getTime())) match.dueDate.$gte = dueFrom;
    if (dueTo && !Number.isNaN(dueTo.getTime())) match.dueDate.$lte = dueTo;
  }

  const regex = buildRegexSearch(filters.search);
  if (regex) {
    match.$or = [{ title: regex }, { description: regex }];
  }

  return match;
}

async function getBlockedWorkflowStatusIds() {
  const Status = getTaskWorkflowStatusModel();
  const rows = await Status.find({
    status: 'active',
    name: { $regex: /block/i },
  }).select('_id').lean();
  return rows.map((r) => r._id);
}

function trendStub() {
  return { delta: 0, direction: 'flat', percent: 0 };
}

function summarizeCard(value, total) {
  const v = Number(value || 0);
  const t = Number(total || 0);
  return {
    value: v,
    percent: t > 0 ? Math.round((v / t) * 100) : 0,
    trend: trendStub(),
  };
}

async function getDashboard(req, query = {}) {
  const scope = await resolveTeamScope(req);
  const Task = getTaskModel();
  const now = new Date();
  const todayStart = startOfTodayUtc();
  const todayEnd = endOfTodayUtc();

  const projectIdsFromClient = await resolveProjectIdsByClient(query.clientId || query.client_id);
  const departmentUserIds = await resolveUserIdsByDepartment(query.department);

  const teamUserIds = scope.teamUserIds || null;
  const filters = {
    status: query.status || null,
    priority: query.priority || null,
    projectId: query.projectId || null,
    projectIds: projectIdsFromClient,
    assigneeUserId: query.userId || query.assigneeUserId || null,
    teamUserIds: departmentUserIds || teamUserIds,
    dueDateFrom: query.dueDateFrom || query.dueDateStart || null,
    dueDateTo: query.dueDateTo || query.dueDateEnd || null,
    search: query.search || null,
  };
  const match = buildTaskMatch(filters);

  const blockedIds = await getBlockedWorkflowStatusIds();

  const [
    totalTasks,
    openTasks,
    inProgress,
    completed,
    critical,
    urgent,
    overdue,
    dueToday,
    blocked,
  ] = await Promise.all([
    Task.countDocuments({ ...match }),
    Task.countDocuments({ ...match, status: 'active' }),
    Task.countDocuments({ ...match, status: 'active', workflowOrder: { $gt: 0 } }),
    Task.countDocuments({ ...match, status: 'completed' }),
    Task.countDocuments({ ...match, status: { $ne: 'archived' }, priority: 'high' }),
    Task.countDocuments({ ...match, status: { $ne: 'archived' }, priority: 'urgent' }),
    Task.countDocuments({ ...match, status: 'active', dueDate: { $lt: now } }),
    Task.countDocuments({ ...match, status: 'active', dueDate: { $gte: todayStart, $lte: todayEnd } }),
    blockedIds.length
      ? Task.countDocuments({ ...match, status: 'active', workflowStatusId: { $in: blockedIds } })
      : Promise.resolve(0),
  ]);

  const summary = {
    totalTasks: summarizeCard(totalTasks, totalTasks),
    openTasks: summarizeCard(openTasks, totalTasks),
    inProgress: summarizeCard(inProgress, totalTasks),
    completed: summarizeCard(completed, totalTasks),
    critical: summarizeCard(critical, totalTasks),
    urgent: summarizeCard(urgent, totalTasks),
    overdue: summarizeCard(overdue, totalTasks),
    dueToday: summarizeCard(dueToday, totalTasks),
    blocked: summarizeCard(blocked, totalTasks),
  };

  const workloadResult = await getWorkload(req, query, { scope, match });
  const charts = await getCharts(req, query, { scope, match });

  return {
    summary,
    workload: workloadResult.items,
    workloadPagination: workloadResult.pagination,
    charts,
  };
}

async function getWorkload(req, query = {}, { scope, match }) {
  const Task = getTaskModel();
  const now = new Date();
  const todayStart = startOfTodayUtc();
  const todayEnd = endOfTodayUtc();
  const pagination = parsePagination(query, { defaultLimit: 20 });

  const userSearch = normalizeSearch(query.searchUser || query.userSearch || '');
  const userRegex = userSearch ? buildRegexSearch(userSearch) : null;

  const pipeline = [
    { $match: match },
    { $unwind: '$assignees' },
  ];

  if (scope.teamUserIds?.length) {
    pipeline.push({ $match: { 'assignees.userId': { $in: scope.teamUserIds.map((id) => assertObjectId(id, 'teamUserId')) } } });
  }

  if (userRegex) {
    pipeline.push({
      $match: {
        $or: [
          { 'assignees.name': userRegex },
          { 'assignees.email': userRegex },
        ],
      },
    });
  }

  pipeline.push({
    $group: {
      _id: '$assignees.userId',
      assigned: {
        $sum: {
          $cond: [{ $eq: ['$status', 'active'] }, 1, 0],
        },
      },
      completed: {
        $sum: {
          $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
        },
      },
      critical: {
        $sum: {
          $cond: [{ $eq: ['$priority', 'high'] }, 1, 0],
        },
      },
      urgent: {
        $sum: {
          $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0],
        },
      },
      overdue: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ['$status', 'active'] },
                { $ne: ['$dueDate', null] },
                { $lt: ['$dueDate', now] },
              ],
            },
            1,
            0,
          ],
        },
      },
      dueToday: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ['$status', 'active'] },
                { $ne: ['$dueDate', null] },
                { $gte: ['$dueDate', todayStart] },
                { $lte: ['$dueDate', todayEnd] },
              ],
            },
            1,
            0,
          ],
        },
      },
      name: { $first: '$assignees.name' },
    },
  });

  pipeline.push({ $sort: { assigned: -1, overdue: -1, urgent: -1 } });

  const rows = await Task.aggregate(pipeline);
  const total = rows.length;
  const pagedRows = rows.slice(pagination.skip, pagination.skip + pagination.limit);
  const userIds = pagedRows.map((r) => String(r._id));

  const userMap = await userSummaryHelper.resolveUsersByIds(userIds);
  const User = getUserModel();
  const userExtras = userIds.length
    ? await User.find({ _id: { $in: userIds }, isDeleted: false })
      .select('_id avatarUrl jobTitle department')
      .lean()
    : [];
  const extrasMap = new Map(userExtras.map((u) => [String(u._id), u]));

  // Hours logged from time entries in date range (optional filter).
  const dateRange = parseDateRange(query);
  const entryFilters = {};
  if (dateRange.from) entryFilters.entryDateFrom = dateRange.from;
  if (dateRange.to) entryFilters.entryDateTo = dateRange.to;

  let minutesByUser = new Map();
  if (userIds.length) {
    const timePipeline = [
      { $match: { isDeleted: false, userId: { $in: userIds.map((id) => assertObjectId(id, 'userId')) }, ...(entryFilters.entryDateFrom || entryFilters.entryDateTo ? { entryDate: {
        ...(entryFilters.entryDateFrom ? { $gte: entryFilters.entryDateFrom } : {}),
        ...(entryFilters.entryDateTo ? { $lte: entryFilters.entryDateTo } : {}),
      } } : {}) } },
      { $group: { _id: '$userId', totalMinutes: { $sum: '$minutes' } } },
    ];
    const TimeEntry = require('../../activity/models/timeEntry.model').getTimeEntryModel();
    const timeRows = await TimeEntry.aggregate(timePipeline);
    minutesByUser = new Map(timeRows.map((r) => [String(r._id), Number(r.totalMinutes || 0)]));
  }

  const maxAssigned = rows.reduce((m, r) => Math.max(m, Number(r.assigned || 0)), 0) || 1;

  const enriched = pagedRows
    .map((row) => {
      const id = String(row._id);
      const summary = userMap.get(id) || { userId: id, displayName: row.name || id.slice(-6) };
      const extra = extrasMap.get(id) || {};
      const assigned = Number(row.assigned || 0);
      const completed = Number(row.completed || 0);
      const efficiency = (assigned + completed) > 0
        ? Math.round((completed / (assigned + completed)) * 100)
        : 0;
      const workloadPct = Math.min(100, Math.round((assigned / maxAssigned) * 100));

      let health = 'healthy';
      if (workloadPct >= 85 || Number(row.overdue || 0) >= Math.max(3, Math.ceil(assigned * 0.4))) health = 'overloaded';
      else if (workloadPct >= 65 || Number(row.overdue || 0) > 0) health = 'warning';

      return {
        user: {
          ...summary,
          avatarUrl: extra.avatarUrl || null,
          role: extra.jobTitle || null,
          department: extra.department || null,
        },
        assigned,
        completed,
        critical: Number(row.critical || 0),
        urgent: Number(row.urgent || 0),
        overdue: Number(row.overdue || 0),
        dueToday: Number(row.dueToday || 0),
        workloadPercent: workloadPct,
        efficiencyPercent: efficiency,
        hoursLogged: Math.round((Number(minutesByUser.get(id) || 0) / 60) * 100) / 100,
        health,
      };
    });

  return {
    items: enriched,
    pagination: buildPaginationMeta({ ...pagination, total }),
  };
}

async function getCharts(_req, _query, { match }) {
  const Task = getTaskModel();

  const [byPriority, byStatus] = await Promise.all([
    Task.aggregate([
      { $match: match },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Task.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    priorityDistribution: byPriority.map((r) => ({ key: r._id || 'none', count: r.count })),
    statusDistribution: byStatus.map((r) => ({ key: r._id || 'unknown', count: r.count })),
    velocity: [],
    completionTrend: [],
    overdueTrend: [],
  };
}

async function listTeamTasks(req, query = {}) {
  const scope = await resolveTeamScope(req);
  const pagination = parsePagination(query, { defaultLimit: 50 });

  const projectIdsFromClient = await resolveProjectIdsByClient(query.clientId || query.client_id);
  const departmentUserIds = await resolveUserIdsByDepartment(query.department);

  const filters = {
    status: query.status || null,
    priority: query.priority || null,
    projectId: query.projectId || null,
    projectIds: projectIdsFromClient,
    assigneeUserId: query.userId || query.assigneeUserId || null,
    teamUserIds: departmentUserIds || scope.teamUserIds,
    dueDateFrom: query.dueDateFrom || query.dueDateStart || null,
    dueDateTo: query.dueDateTo || query.dueDateEnd || null,
    search: query.search || null,
  };

  const match = buildTaskMatch(filters);
  const Task = getTaskModel();

  const sortKey = String(query.sort || '').trim();
  const dir = String(query.dir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const sort = sortKey === 'dueDate'
    ? { dueDate: dir, updatedAt: -1 }
    : sortKey === 'priority'
      ? { priority: dir, updatedAt: -1 }
      : { updatedAt: -1 };

  const [items, total] = await Promise.all([
    Task.find(match).sort(sort).skip(pagination.skip).limit(pagination.limit).lean(),
    Task.countDocuments(match),
  ]);

  // Enrich project + client names (lightweight, no business logic changes).
  const projectIds = [...new Set(items.map((t) => String(t.projectId)).filter(Boolean))];
  const Project = getProjectModel();
  const projects = projectIds.length
    ? await Project.find({ _id: { $in: projectIds }, isDeleted: false }).select('_id name clientId').lean()
    : [];
  const projectMap = new Map(projects.map((p) => [String(p._id), p]));
  const clientIds = [...new Set(projects.map((p) => String(p.clientId)).filter(Boolean))];
  const Client = getClientModel();
  const clients = clientIds.length
    ? await Client.find({ _id: { $in: clientIds }, isDeleted: false }).select('_id companyName name').lean()
    : [];
  const clientMap = new Map(clients.map((c) => [String(c._id), c]));

  const data = items.map((t) => {
    const proj = projectMap.get(String(t.projectId)) || null;
    const client = proj ? clientMap.get(String(proj.clientId)) : null;
    return {
      id: String(t._id),
      taskNumber: t.taskNumber || null,
      title: t.title || '',
      project: proj ? { id: String(proj._id), name: proj.name || '' } : null,
      client: client
        ? { id: String(client._id), name: client.companyName || client.name || '' }
        : null,
      priority: t.priority || 'none',
      status: t.status || 'active',
      workflowStatusId: t.workflowStatusId ? String(t.workflowStatusId) : null,
      dueDate: t.dueDate || null,
      assignees: (t.assignees || []).map((a) => ({
        userId: a.userId ? String(a.userId) : null,
        name: a.name || null,
        email: a.email || null,
      })),
      estimatedMinutes: t.estimatedMinutes ?? null,
      timeLoggedMinutes: null,
      subtasks: [],
    };
  });

  return {
    items: data,
    pagination: buildPaginationMeta({ ...pagination, total }),
  };
}

async function getUserDashboard(req, userId, query = {}) {
  const scope = await resolveTeamScope(req);
  const id = assertObjectId(userId, 'userId');

  if (scope.teamUserIds?.length && !scope.teamUserIds.includes(String(id))) {
    throw new AppError('Forbidden team access', { status: 403, code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT });
  }

  const User = getUserModel();
  const user = await User.findOne({ _id: id, isDeleted: false }).lean();
  if (!user) {
    throw new AppError('User not found', { status: 404, code: taskErrorCodes.TASK_USER_NOT_FOUND });
  }

  const Task = getTaskModel();
  const now = new Date();
  const todayStart = startOfTodayUtc();
  const todayEnd = endOfTodayUtc();

  const projectIdsFromClient = await resolveProjectIdsByClient(query.clientId || query.client_id);

  const match = buildTaskMatch({
    status: query.status || null,
    priority: query.priority || null,
    projectId: query.projectId || null,
    projectIds: projectIdsFromClient,
    assigneeUserId: String(id),
    dueDateFrom: query.dueDateFrom || query.dueDateStart || null,
    dueDateTo: query.dueDateTo || query.dueDateEnd || null,
    search: query.search || null,
  });

  const [
    assigned,
    completed,
    critical,
    overdue,
    dueToday,
    activeProjectsAgg,
    avgCompletionAgg,
  ] = await Promise.all([
    Task.countDocuments({ ...match, status: 'active' }),
    Task.countDocuments({ ...match, status: 'completed' }),
    Task.countDocuments({ ...match, priority: 'high', status: { $ne: 'archived' } }),
    Task.countDocuments({ ...match, status: 'active', dueDate: { $lt: now } }),
    Task.countDocuments({ ...match, status: 'active', dueDate: { $gte: todayStart, $lte: todayEnd } }),
    Task.aggregate([
      { $match: { ...match, status: { $ne: 'archived' } } },
      { $group: { _id: '$projectId' } },
      { $count: 'count' },
    ]),
    Task.aggregate([
      { $match: { ...match, status: 'completed', completedAt: { $ne: null } } },
      {
        $project: {
          completionDays: {
            $divide: [
              { $subtract: ['$completedAt', '$createdAt'] },
              1000 * 60 * 60 * 24,
            ],
          },
        },
      },
      { $group: { _id: null, avg: { $avg: '$completionDays' } } },
    ]),
  ]);

  const avgCompletionDays = avgCompletionAgg?.[0]?.avg != null
    ? Math.round(Number(avgCompletionAgg[0].avg) * 10) / 10
    : null;

  const activeProjects = Number(activeProjectsAgg?.[0]?.count || 0);

  const tasks = await listTeamTasks(req, {
    ...query,
    userId: String(id),
    limit: query.limit || 200,
    page: query.page || 1,
  });

  return {
    user: {
      userId: String(user._id),
      displayName: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      email: user.email || null,
      avatarUrl: user.avatarUrl || null,
      role: user.jobTitle || null,
      department: user.department || null,
    },
    stats: {
      assigned,
      completed,
      critical,
      overdue,
      dueToday,
      avgCompletionDays,
      activeProjects,
    },
    tasks,
  };
}

module.exports = {
  getDashboard,
  listTeamTasks,
  getUserDashboard,
};
