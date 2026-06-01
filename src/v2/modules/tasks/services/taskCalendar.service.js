const { getTaskModel } = require('../models/task.model');
const { buildCalendarMatch } = require('../helpers/taskAnalyticsScope.helper');
const { enrichTask } = require('./taskBoard.service');
const { getProjectModel } = require('../../projects/models/project.model');

async function loadProjectNames(projectIds = []) {
  const ids = [...new Set((projectIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return {};

  const Project = getProjectModel();
  const rows = await Project.find({ _id: { $in: ids }, isDeleted: false })
    .select('name')
    .lean();

  return Object.fromEntries(rows.map((row) => [String(row._id), row.name || '']));
}

async function getCalendar(req) {
  const match = await buildCalendarMatch(req);
  if (!match) return [];

  const Task = getTaskModel();
  const tasks = await Task.find(match).sort({ dueDate: 1 }).lean();
  const projectNames = await loadProjectNames(tasks.map((task) => task.projectId));

  return Promise.all(tasks.map(async (task) => {
    const dto = await enrichTask(task);
    return {
      ...dto,
      projectName: projectNames[String(task.projectId)] || '',
    };
  }));
}

module.exports = {
  getCalendar,
};
