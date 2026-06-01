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
  const taskIds = await listScopedTaskIds(req);
  if (!taskIds.length) return [];

  const activities = await taskActivityRepository.listByTaskIds(taskIds, { limit: 100 });
  return enrichActivities(activities);
}

async function getActivitySummary(req) {
  const activities = await taskActivityRepository.listRecent({ limit: 50 });
  return enrichActivities(activities);
}

module.exports = {
  getActivityFeed,
  getActivitySummary,
};
