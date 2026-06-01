const { getTaskWorkflowModel } = require('../models/taskWorkflow.model');

async function findDefaultByProjectId(projectId) {
  const TaskWorkflow = getTaskWorkflowModel();
  return TaskWorkflow.findOne({ projectId, isDefault: true, status: 'active' }).exec();
}

async function createWorkflow(payload) {
  const TaskWorkflow = getTaskWorkflowModel();
  return TaskWorkflow.create(payload);
}

module.exports = {
  findDefaultByProjectId,
  createWorkflow,
};
