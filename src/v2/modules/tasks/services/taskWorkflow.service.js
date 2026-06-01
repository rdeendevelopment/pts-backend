const taskWorkflowRepository = require('../repositories/taskWorkflow.repository');
const taskWorkflowStatusRepository = require('../repositories/taskWorkflowStatus.repository');
const { DEFAULT_WORKFLOW_STATUSES } = require('../helpers/workflowDefaults.helper');

async function getOrCreateProjectWorkflow(projectId) {
  let workflow = await taskWorkflowRepository.findDefaultByProjectId(projectId);
  if (workflow) {
    const statuses = await taskWorkflowStatusRepository.listByWorkflowId(workflow._id);
    return { workflow, statuses };
  }

  workflow = await taskWorkflowRepository.createWorkflow({
    projectId,
    name: 'Default Workflow',
    isDefault: true,
    status: 'active',
  });

  const statuses = await taskWorkflowStatusRepository.createMany(
    DEFAULT_WORKFLOW_STATUSES.map((row) => ({
      workflowId: workflow._id,
      projectId,
      name: row.name,
      key: row.key,
      order: row.order,
      category: row.category,
      color: row.color,
      isTerminal: row.isTerminal,
      status: 'active',
    }))
  );

  return { workflow, statuses };
}

async function getProjectWorkflow(projectId) {
  const workflow = await taskWorkflowRepository.findDefaultByProjectId(projectId);
  if (!workflow) return null;
  const statuses = await taskWorkflowStatusRepository.listByWorkflowId(workflow._id);
  return { workflow, statuses };
}

module.exports = {
  getOrCreateProjectWorkflow,
  getProjectWorkflow,
};
