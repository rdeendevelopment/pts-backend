const mongoose = require('mongoose');

const { ActivityCategory, CoreProject, CoreUser, ProjectAssignment, TimeEntry } = require('../MongoModels');
const Task = require('../MongoModels/task.model');
const { getBudgetSummary } = require('../Services/project-budget.service');

function labelMinutes(minutes) {
  const value = Number(minutes || 0);
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function finalEntryMatch(project, filters = {}) {
  const match = {
    status: { $in: ['submitted', 'approved'] },
    $or: [
      { projectId: project._id },
      { legacyProjectId: Number(project.legacyId) },
    ],
  };
  if (filters.startDate) match.entryDate = { ...(match.entryDate || {}), $gte: filters.startDate };
  if (filters.endDate) match.entryDate = { ...(match.entryDate || {}), $lte: filters.endDate };
  if (filters.userId) match.legacyUserId = Number(filters.userId);
  if (filters.activityCategoryId) match.legacyActivityCategoryId = Number(filters.activityCategoryId);
  if (filters.entryType) match.entryType = filters.entryType;
  if (filters.status) match.status = filters.status;
  return match;
}

async function attachTaskTitles(rows) {
  const taskIds = Array.from(new Set(rows.map((row) => row.taskId || row.task_id).filter(Boolean).map(String)));
  const validTaskIds = taskIds.filter((taskId) => mongoose.isValidObjectId(taskId));
  const tasks = validTaskIds.length ? await Task.find({ _id: { $in: validTaskIds }, status: { $ne: 'archived' } }, { title: 1 }).lean() : [];
  const taskMap = new Map(tasks.map((task) => [String(task._id), task.title]));
  return rows.map((row) => {
    const taskId = row.taskId || row.task_id;
    return taskId ? { ...row, taskTitle: taskMap.get(String(taskId)) || 'Task unavailable' } : row;
  });
}

async function getProjectDashboard(projectId) {
  const project = await CoreProject.findOne({ legacyId: Number(projectId), isDeleted: false }).populate('clientId').lean();
  if (!project) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }

  const match = finalEntryMatch(project);
  const [totalRows, byUser, byCategory, recentRows, taskSummary, budgetSummary] = await Promise.all([
    TimeEntry.aggregate([{ $match: match }, { $group: { _id: null, minutes: { $sum: '$durationMinutes' } } }]),
    TimeEntry.aggregate([{ $match: match }, { $group: { _id: '$legacyUserId', minutes: { $sum: '$durationMinutes' } } }, { $sort: { minutes: -1 } }]),
    TimeEntry.aggregate([{ $match: match }, { $group: { _id: '$legacyActivityCategoryId', minutes: { $sum: '$durationMinutes' } } }, { $sort: { minutes: -1 } }]),
    TimeEntry.find(match)
      .populate('userId')
      .populate('projectId')
      .populate('activityCategoryId')
      .populate('budgetId')
      .sort({ entryDate: -1, legacyId: -1 })
      .limit(10)
      .lean(),
    Task.aggregate([
      { $match: { 'projectRef.sourceId': Number(projectId), status: { $ne: 'archived' } } },
      { $group: { _id: null, total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
    ]),
    getBudgetSummary(projectId),
  ]);

  const [users, categories] = await Promise.all([
    CoreUser.find({ legacyId: { $in: byUser.map((row) => row._id).filter(Boolean) } }).lean(),
    ActivityCategory.find({ legacyId: { $in: byCategory.map((row) => row._id).filter(Boolean) } }).lean(),
  ]);
  const userMap = new Map(users.map((user) => [user.legacyId, [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || `User ${user.legacyId}`]));
  const categoryMap = new Map(categories.map((category) => [category.legacyId, category.name]));
  const totalTimeMinutes = Number(totalRows[0]?.minutes || 0);
  const summary = taskSummary[0] || { total: 0, completed: 0 };
  const recentTimeEntries = await attachTaskTitles(recentRows.map((row) => ({
    id: row.legacyId,
    entry_date: row.entryDate,
    user_id: row.legacyUserId,
    project_id: row.legacyProjectId,
    task_id: row.taskId,
    budget_id: row.legacyBudgetId,
    duration_minutes: row.durationMinutes,
    entry_type: row.entryType,
    status: row.status,
    description: row.description,
    userName: row.userId ? [row.userId.firstName, row.userId.lastName].filter(Boolean).join(' ') || row.userId.email : `User ${row.legacyUserId}`,
    projectName: row.projectId?.title,
    activityCategoryName: row.activityCategoryId?.name,
    budgetName: row.budgetId?.name,
  })));

  return {
    project: {
      id: project.legacyId,
      name: project.title,
      client: project.clientId?.companyName || [project.clientId?.firstName, project.clientId?.lastName].filter(Boolean).join(' ') || '',
      status: project.status,
    },
    totalTimeMinutes,
    totalTimeLabel: labelMinutes(totalTimeMinutes),
    taskSummary: {
      total: Number(summary.total || 0),
      completed: Number(summary.completed || 0),
      pending: Number(summary.total || 0) - Number(summary.completed || 0),
    },
    timeByUser: byUser.map((row) => ({ userId: row._id, name: userMap.get(row._id) || `User ${row._id}`, minutes: Number(row.minutes || 0), label: labelMinutes(row.minutes) })),
    timeByCategory: byCategory.map((row) => ({ activityCategoryId: row._id, name: categoryMap.get(row._id) || 'Uncategorized', minutes: Number(row.minutes || 0), label: labelMinutes(row.minutes) })),
    recentTimeEntries,
    ...budgetSummary,
  };
}

async function getProjectTimeEntries(projectId, filters = {}) {
  const project = await CoreProject.findOne({ legacyId: Number(projectId), isDeleted: false }, { _id: 1, legacyId: 1 }).lean();
  if (!project) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }
  const rows = await TimeEntry.find(finalEntryMatch(project, filters))
    .populate('userId')
    .populate('projectId')
    .populate('activityCategoryId')
    .populate('budgetId')
    .sort({ entryDate: -1, legacyId: -1 })
    .lean();
  const mapped = rows.map((row) => ({
    id: row.legacyId,
    date: row.entryDate,
    userId: row.legacyUserId,
    projectId: row.legacyProjectId,
    activityCategoryId: row.legacyActivityCategoryId,
    taskId: row.taskId,
    budgetId: row.legacyBudgetId,
    durationMinutes: Number(row.durationMinutes || 0),
    entryType: row.entryType,
    status: row.status,
    description: row.description,
    userName: row.userId ? [row.userId.firstName, row.userId.lastName].filter(Boolean).join(' ') || row.userId.email : `User ${row.legacyUserId}`,
    projectName: row.projectId?.title,
    activityCategoryName: row.activityCategoryId?.name,
    budgetName: row.budgetId?.name,
    durationLabel: labelMinutes(row.durationMinutes),
  }));
  return attachTaskTitles(mapped);
}

async function getEmployeeWorkload(actor, targetUserId, access, query = {}) {
  if (!(await canViewEmployeeWorkload(actor, targetUserId, access))) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  const user = await CoreUser.findOne({ legacyId: Number(targetUserId), isDeleted: false }).lean();
  if (!user) {
    const error = new Error('Employee not found');
    error.status = 404;
    throw error;
  }
  const range = rangeFromQuery(query);
  const match = { legacyUserId: Number(targetUserId), status: { $in: ['submitted', 'approved'] } };
  if (range.startDate) match.entryDate = { ...(match.entryDate || {}), $gte: range.startDate };
  if (range.endDate) match.entryDate = { ...(match.entryDate || {}), $lte: range.endDate };

  const [totalRows, projectBreakdown, categoryBreakdown, taskSummary] = await Promise.all([
    TimeEntry.aggregate([{ $match: match }, { $group: { _id: null, minutes: { $sum: '$durationMinutes' } } }]),
    TimeEntry.aggregate([{ $match: match }, { $group: { _id: '$legacyProjectId', minutes: { $sum: '$durationMinutes' } } }, { $sort: { minutes: -1 } }]),
    TimeEntry.aggregate([{ $match: match }, { $group: { _id: '$legacyActivityCategoryId', minutes: { $sum: '$durationMinutes' } } }, { $sort: { minutes: -1 } }]),
    TimeEntry.aggregate([{ $match: { ...match, taskId: { $nin: [null, ''] } } }, { $group: { _id: '$taskId', minutes: { $sum: '$durationMinutes' } } }, { $sort: { minutes: -1 } }]),
  ]);
  const [projects, categories] = await Promise.all([
    CoreProject.find({ legacyId: { $in: projectBreakdown.map((row) => row._id).filter(Boolean) } }).lean(),
    ActivityCategory.find({ legacyId: { $in: categoryBreakdown.map((row) => row._id).filter(Boolean) } }).lean(),
  ]);
  const projectMap = new Map(projects.map((project) => [project.legacyId, project.title]));
  const categoryMap = new Map(categories.map((category) => [category.legacyId, category.name]));
  const total = Number(totalRows[0]?.minutes || 0);
  return {
    employee: { id: user.legacyId, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email, email: user.email },
    startDate: range.startDate,
    endDate: range.endDate,
    totalMinutes: total,
    totalLabel: labelMinutes(total),
    projectBreakdown: projectBreakdown.map((row) => ({ projectId: row._id, name: projectMap.get(row._id) || `Project ${row._id}`, minutes: Number(row.minutes || 0), label: labelMinutes(row.minutes) })),
    activityCategoryBreakdown: categoryBreakdown.map((row) => ({ activityCategoryId: row._id, name: categoryMap.get(row._id) || 'Uncategorized', minutes: Number(row.minutes || 0), label: labelMinutes(row.minutes) })),
    taskTimeSummary: taskSummary.map((row) => ({ taskId: String(row._id), totalMinutes: Number(row.minutes || 0), label: labelMinutes(row.minutes) })),
  };
}

function rangeFromQuery(query = {}) {
  if (query.weekStart) {
    const start = new Date(`${query.weekStart}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { startDate: query.weekStart, endDate: end.toISOString().slice(0, 10) };
  }
  return { startDate: query.startDate || null, endDate: query.endDate || null };
}

async function canViewEmployeeWorkload(actor, targetUserId, access) {
  if (access.permissions.includes('reports.view_all') || access.permissions.includes('time.view_all')) return true;
  if (Number(actor.id) === Number(targetUserId) && (access.permissions.includes('reports.view_own') || access.permissions.includes('time.view_own'))) return true;
  if (!(access.permissions.includes('reports.view_team') || access.permissions.includes('time.view_team'))) return false;
  const actorProjectIds = await ProjectAssignment.distinct('legacyProjectId', { legacyUserId: Number(actor.id), isDeleted: false, status: { $ne: 'unassigned' } });
  return Boolean(await ProjectAssignment.exists({ legacyUserId: Number(targetUserId), legacyProjectId: { $in: actorProjectIds }, isDeleted: false, status: { $ne: 'unassigned' } }));
}

module.exports = {
  getProjectDashboard,
  getProjectTimeEntries,
  getEmployeeWorkload,
  labelMinutes,
};
