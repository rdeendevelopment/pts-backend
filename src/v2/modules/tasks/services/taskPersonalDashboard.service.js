const { Types } = require('mongoose');
const { getTaskModel } = require('../models/task.model');
const { getTaskCollaboratorModel } = require('../models/taskCollaborator.model');
const { resolveUserIdFromAuth } = require('../helpers/taskAccessScope.helper');

function startOfDay(date = new Date()) {
  const value = new Date(date); value.setHours(0, 0, 0, 0); return value;
}

function taskRow(row) {
  return {
    id: String(row._id), taskNumber: row.taskNumber || null, title: row.title,
    projectId: row.projectId ? String(row.projectId) : '', projectName: row.project?.name || '',
    statusName: row.workflowStatus?.name || '', statusCategory: row.workflowStatus?.category || '',
    statusColor: row.workflowStatus?.color || '', priority: row.priority, dueDate: row.dueDate || null,
  };
}

function buildPersonalScope(userId, collaboratorIds = []) {
  return {
    isDeleted: false,
    $or: [
      { primaryAssigneeId: userId },
      { 'assignees.userId': userId },
      { _id: { $in: collaboratorIds.map((id) => new Types.ObjectId(id)) } },
    ],
  };
}

async function getPersonalDashboard(req) {
  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const collaboratorIds = await getTaskCollaboratorModel().distinct('taskId', { userId, isActive: true });
  const today = startOfDay();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const scope = buildPersonalScope(userId, collaboratorIds);
  const Task = getTaskModel();
  const [result] = await Task.aggregate([
    { $match: scope },
    { $lookup: { from: 'pts_task_workflow_statuses', localField: 'workflowStatusId', foreignField: '_id', as: 'workflowStatus' } },
    { $unwind: { path: '$workflowStatus', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'pts_projects', localField: 'projectId', foreignField: '_id', as: 'project' } },
    { $unwind: { path: '$project', preserveNullAndEmptyArrays: true } },
    { $facet: {
      summary: [{ $group: {
        _id: null,
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $lt: ['$dueDate', today] }, { $ne: ['$dueDate', null] }] }, 1, 0] } },
        dueToday: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $gte: ['$dueDate', today] }, { $lt: ['$dueDate', tomorrow] }] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $regexMatch: { input: { $ifNull: ['$workflowStatus.name', ''] }, regex: /(progress|doing)/i } }] }, 1, 0] } },
        inReview: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $regexMatch: { input: { $ifNull: ['$workflowStatus.name', ''] }, regex: /(review|qa)/i } }] }, 1, 0] } },
        urgent: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $in: ['$priority', ['urgent', 'high']] }] }, 1, 0] } },
      } }],
      focus: [
        { $match: { status: 'active', $or: [{ dueDate: { $lt: tomorrow } }, { priority: { $in: ['urgent', 'high'] } }, { 'workflowStatus.name': { $regex: /(review|qa|blocked)/i } }] } },
        { $set: { focusRank: { $switch: { branches: [
          { case: { $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', today] }] }, then: 1 },
          { case: { $in: ['$priority', ['urgent', 'high']] }, then: 2 },
          { case: { $and: [{ $gte: ['$dueDate', today] }, { $lt: ['$dueDate', tomorrow] }] }, then: 3 },
          { case: { $regexMatch: { input: { $ifNull: ['$workflowStatus.name', ''] }, regex: /(review|qa)/i } }, then: 4 },
        ], default: 5 } } } }, { $sort: { focusRank: 1, dueDate: 1, _id: 1 } }, { $limit: 5 },
      ],
      upcoming: [{ $match: { status: 'active', dueDate: { $gte: today, $lt: weekEnd } } }, { $sort: { dueDate: 1, _id: 1 } }, { $limit: 12 }],
      statusCounts: [{ $match: { status: 'active' } }, { $group: { _id: { id: '$workflowStatusId', name: '$workflowStatus.name', category: '$workflowStatus.category', color: '$workflowStatus.color' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }],
      projectCounts: [{ $match: { status: 'active' } }, { $group: { _id: { id: '$projectId', name: '$project.name' }, active: { $sum: 1 }, overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', today] }] }, 1, 0] } } } }, { $sort: { overdue: -1, active: -1 } }, { $limit: 8 }],
      progress: [{ $match: { status: 'completed', completedAt: { $ne: null } } }, { $group: { _id: null, thisWeek: { $sum: { $cond: [{ $gte: ['$completedAt', weekStart] }, 1, 0] } }, thisMonth: { $sum: { $cond: [{ $gte: ['$completedAt', monthStart] }, 1, 0] } } } }],
    } },
  ]);
  const summary = result?.summary?.[0] || { active: 0, completed: 0, overdue: 0, dueToday: 0, inProgress: 0, inReview: 0, urgent: 0 };
  const upcoming = { today: [], tomorrow: [], thisWeek: [] };
  for (const row of result?.upcoming || []) {
    const target = new Date(row.dueDate) < tomorrow ? upcoming.today : new Date(row.dueDate) < dayAfterTomorrow ? upcoming.tomorrow : upcoming.thisWeek;
    if (target.length < 4) target.push(taskRow(row));
  }
  return {
    summary,
    focus: (result?.focus || []).map(taskRow),
    upcoming,
    statusCounts: (result?.statusCounts || []).map((row) => ({ id: String(row._id.id || ''), name: row._id.name || 'Unlabelled', category: row._id.category || '', color: row._id.color || '', count: row.count })),
    projectCounts: (result?.projectCounts || []).map((row) => ({ id: String(row._id.id || ''), name: row._id.name || 'Project', active: row.active, overdue: row.overdue })),
    progress: { completedThisWeek: result?.progress?.[0]?.thisWeek || 0, completedThisMonth: result?.progress?.[0]?.thisMonth || 0, completionRate: summary.active + summary.completed ? Math.round((summary.completed / (summary.active + summary.completed)) * 100) : 0 },
  };
}

module.exports = { buildPersonalScope, getPersonalDashboard };
