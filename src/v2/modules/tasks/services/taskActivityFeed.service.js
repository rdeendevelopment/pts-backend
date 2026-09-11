const { assertObjectId } = require('../../../kernel/validators/objectId');
const { getProjectModel } = require('../../projects/models/project.model');
const taskActivityRepository = require('../repositories/taskActivity.repository');
const { listScopedTaskIds } = require('../helpers/taskAnalyticsScope.helper');
const { toActivityEntryDto } = require('../helpers/taskActivity.dto.helper');
const { displayName, resolveAuthorsByAccountIds } = require('../helpers/taskUser.helper');

function isValidObjectId(value) {
  try {
    assertObjectId(value, 'id');
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeAccountIds(accountIds = []) {
  return [...new Set(
    (accountIds || [])
      .map((id) => (id == null ? '' : String(id).trim()))
      .filter((id) => id && id !== 'null' && id !== 'undefined' && isValidObjectId(id)),
  )];
}

async function loadProjectNames(projectIds = []) {
  const ids = [...new Set((projectIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return {};

  const Project = getProjectModel();
  const rows = await Project.find({ _id: { $in: ids }, isDeleted: false })
    .select('name')
    .lean();

  return Object.fromEntries(rows.map((row) => [String(row._id), row.name || '']));
}

async function enrichActivities(activities = []) {
  if (!activities.length) return [];

  const taskIds = [...new Set(activities.map((row) => String(row.taskId)).filter(Boolean))];
  const accountIds = normalizeAccountIds(activities.map((row) => row.performedBy));

  const Task = require('../models/task.model').getTaskModel();
  const [taskDocs, actorMap, projectNames] = await Promise.all([
    Task.find({ _id: { $in: taskIds } }).select('title taskNumber projectId').lean(),
    resolveAuthorsByAccountIds(accountIds),
    loadProjectNames(activities.map((row) => row.projectId)),
  ]);

  const taskMap = Object.fromEntries(taskDocs.map((task) => [String(task._id), task]));

  return activities.map((activity) => {
    const task = taskMap[String(activity.taskId)];
    const actor = actorMap[String(activity.performedBy)] || {};
    const projectId = String(activity.projectId || task?.projectId || '');

    return toActivityEntryDto(activity, {
      task,
      projectName: projectNames[projectId] || '',
      actorName: displayName(actor) || 'Someone',
    });
  });
}

async function getActivityFeed(req) {
  const query = req.query || {};
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 25));
  let taskIds = await listScopedTaskIds(req);

  if (query.search?.trim() && taskIds.length) {
    const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const Task = require('../models/task.model').getTaskModel();
    const matching = await Task.find({
      _id: { $in: taskIds },
      title: { $regex: escaped, $options: 'i' },
    }).select('_id').lean();
    taskIds = matching.map((task) => task._id);
  }

  const dateTo = query.dateTo ? new Date(query.dateTo) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);
  const result = await taskActivityRepository.listPageByTaskIds(taskIds, {
    page,
    limit,
    projectId: query.projectId || null,
    eventType: query.eventType || null,
    dateFrom: query.dateFrom ? new Date(query.dateFrom) : null,
    dateTo,
  });
  const items = await enrichActivities(result.items);
  return {
    items,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasMore: page * limit < result.total,
    },
  };
}

async function getActivitySummary(req) {
  const activities = await taskActivityRepository.listRecent({ limit: 50 });
  return enrichActivities(activities);
}

async function getActivityForTask(req, taskId) {
  const id = assertObjectId(taskId, 'taskId');
  const activities = await taskActivityRepository.listByTaskIds([id], { limit: 100 });
  return enrichActivities(activities);
}

module.exports = {
  getActivityFeed,
  getActivitySummary,
  getActivityForTask,
};
