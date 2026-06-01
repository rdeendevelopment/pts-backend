const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { getTaskModel } = require('../models/task.model');
const { getProjectModel } = require('../../projects/models/project.model');
const taskWorkflowStatusRepository = require('../repositories/taskWorkflowStatus.repository');
const { canManageTasks } = require('../helpers/taskAccessScope.helper');
const { buildReportsMatch } = require('../helpers/taskAnalyticsScope.helper');
const taskErrorCodes = require('../errors/taskErrorCodes');

const EMPTY_REPORTS = {
  summary: { total: 0, active: 0, completed: 0, overdue: 0, inProgress: 0 },
  byStatus: [],
  byPriority: [],
  byProject: [],
  byAssignee: [],
};

async function getReports(req, query = {}) {
  let projectId = null;
  if (query.projectId != null && String(query.projectId).trim() !== '') {
    projectId = assertObjectId(query.projectId, 'projectId');
  }

  const match = await buildReportsMatch(req, projectId);
  if (!match) return EMPTY_REPORTS;

  const Task = getTaskModel();
  const now = new Date();

  const [
    activeCount,
    completedCount,
    overdueCount,
    byStatusAgg,
    byPriorityAgg,
    byProjectAgg,
    byAssigneeAgg,
  ] = await Promise.all([
    Task.countDocuments({ ...match, status: 'active' }),
    Task.countDocuments({ ...match, status: 'completed' }),
    Task.countDocuments({ ...match, status: 'active', dueDate: { $lt: now } }),
    Task.aggregate([
      { $match: { ...match, status: { $ne: 'archived' } } },
      { $group: { _id: '$workflowStatusId', count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { ...match, status: { $ne: 'archived' } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { ...match, status: { $ne: 'archived' } } },
      { $group: { _id: '$projectId', count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { ...match, status: { $ne: 'archived' } } },
      { $unwind: '$assignees' },
      { $group: { _id: '$assignees.userId', name: { $first: '$assignees.name' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
  ]);

  const statusIds = byStatusAgg.map((row) => row._id).filter(Boolean);
  const statusDocs = statusIds.length
    ? await Promise.all(statusIds.map((id) => taskWorkflowStatusRepository.findById(id)))
    : [];
  const statusMap = Object.fromEntries(
    statusDocs.filter(Boolean).map((status) => [String(status._id), status])
  );

  const byStatus = byStatusAgg.map((row) => ({
    _id: String(row._id),
    name: statusMap[String(row._id)]?.name || 'Unknown',
    color: statusMap[String(row._id)]?.color || '#9CA3AF',
    category: statusMap[String(row._id)]?.category,
    count: row.count,
  }));

  const projectIds = byProjectAgg.map((row) => row._id).filter(Boolean);
  const Project = getProjectModel();
  const projectDocs = projectIds.length
    ? await Project.find({ _id: { $in: projectIds }, isDeleted: false }).select('name').lean()
    : [];
  const projectMap = Object.fromEntries(projectDocs.map((row) => [String(row._id), row.name || '']));

  const byProject = byProjectAgg
    .map((row) => ({
      projectId: String(row._id),
      projectName: projectMap[String(row._id)] || 'Unknown project',
      count: row.count,
    }))
    .sort((a, b) => b.count - a.count);

  const TaskWorkflowStatus = require('../models/taskWorkflowStatus.model').getTaskWorkflowStatusModel();
  const inProgressStatuses = await TaskWorkflowStatus.find({
    status: 'active',
    category: 'active',
  })
    .select('_id')
    .lean();
  const inProgressIds = inProgressStatuses.map((status) => status._id);
  const inProgressCount = inProgressIds.length
    ? await Task.countDocuments({
      ...match,
      status: 'active',
      workflowStatusId: { $in: inProgressIds },
    })
    : 0;

  return {
    summary: {
      total: activeCount + completedCount,
      active: activeCount,
      completed: completedCount,
      overdue: overdueCount,
      inProgress: inProgressCount,
    },
    byStatus,
    byPriority: byPriorityAgg,
    byProject,
    byAssignee: byAssigneeAgg.map((row) => ({
      _id: String(row._id),
      name: row.name || String(row._id).slice(-6),
      count: row.count,
    })),
  };
}

async function getWorkload(req) {
  if (!canManageTasks(req)) {
    throw new AppError('Workload reports require admin access', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
  }

  const Task = getTaskModel();
  const now = new Date();

  const [assigneeAgg, overdueAgg] = await Promise.all([
    Task.aggregate([
      { $match: { isDeleted: false, status: { $ne: 'archived' } } },
      { $unwind: '$assignees' },
      { $group: { _id: '$assignees.userId', name: { $first: '$assignees.name' }, total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 30 },
    ]),
    Task.aggregate([
      { $match: { isDeleted: false, status: 'active', dueDate: { $lt: now } } },
      { $unwind: '$assignees' },
      { $group: { _id: '$assignees.userId', overdue: { $sum: 1 } } },
    ]),
  ]);

  const overdueMap = Object.fromEntries(
    overdueAgg.map((row) => [String(row._id), row.overdue])
  );

  return assigneeAgg.map((row) => ({
    userId: String(row._id),
    name: row.name || String(row._id).slice(-6),
    total: row.total,
    overdue: overdueMap[String(row._id)] || 0,
  }));
}

async function getProjectHealth(req) {
  if (!canManageTasks(req)) {
    throw new AppError('Project health reports require admin access', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
  }

  const Task = getTaskModel();
  const Project = getProjectModel();
  const now = new Date();

  const projects = await Project.find({
    isDeleted: false,
    status: { $nin: ['archived', 'cancelled', 'completed'] },
  })
    .select('name')
    .lean();

  const projectIds = projects.map((row) => row._id);
  if (!projectIds.length) return [];

  const [totalAgg, overdueAgg, completedAgg] = await Promise.all([
    Task.aggregate([
      { $match: { isDeleted: false, projectId: { $in: projectIds }, status: { $ne: 'archived' } } },
      { $group: { _id: '$projectId', total: { $sum: 1 } } },
    ]),
    Task.aggregate([
      {
        $match: {
          isDeleted: false,
          projectId: { $in: projectIds },
          status: 'active',
          dueDate: { $lt: now },
        },
      },
      { $group: { _id: '$projectId', overdue: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: { isDeleted: false, projectId: { $in: projectIds }, status: 'completed' } },
      { $group: { _id: '$projectId', completed: { $sum: 1 } } },
    ]),
  ]);

  const totalMap = Object.fromEntries(totalAgg.map((row) => [String(row._id), row.total]));
  const overdueMap = Object.fromEntries(overdueAgg.map((row) => [String(row._id), row.overdue]));
  const completedMap = Object.fromEntries(completedAgg.map((row) => [String(row._id), row.completed]));

  return projects
    .filter((project) => (totalMap[String(project._id)] || 0) > 0)
    .map((project) => {
      const id = String(project._id);
      const total = totalMap[id] || 0;
      const overdue = overdueMap[id] || 0;
      const completed = completedMap[id] || 0;
      const active = total - completed;
      let health = 'healthy';
      if (overdue > 0 && active > 0 && overdue >= active * 0.5) health = 'overdue_heavy';
      else if (overdue > 0) health = 'at_risk';

      return {
        projectId: id,
        projectName: project.name || 'Unknown project',
        total,
        overdue,
        completed,
        active,
        health,
      };
    });
}

module.exports = {
  getReports,
  getWorkload,
  getProjectHealth,
};
