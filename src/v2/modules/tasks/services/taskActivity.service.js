const taskActivityRepository = require('../repositories/taskActivity.repository');

async function logTaskActivity({
  taskId,
  projectId,
  eventType,
  title = null,
  description = null,
  performedBy = null,
  metadata = {},
}) {
  return taskActivityRepository.createActivity({
    taskId,
    projectId,
    eventType,
    title,
    description,
    performedBy,
    metadata,
  });
}

module.exports = {
  logTaskActivity,
};
