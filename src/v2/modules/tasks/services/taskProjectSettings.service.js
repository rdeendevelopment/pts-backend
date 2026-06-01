const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectRepository = require('../../projects/repositories/project.repository');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskRepository = require('../repositories/task.repository');
const taskWorkflowStatusRepository = require('../repositories/taskWorkflowStatus.repository');
const taskAccessService = require('./taskAccess.service');
const taskWorkflowService = require('./taskWorkflow.service');
const { canManageTasks } = require('../helpers/taskAccessScope.helper');
const {
  slugifyStatusKey,
  assertReorderUpdates,
  assertArchiveAllowed,
  nextStatusOrder,
} = require('../helpers/taskWorkflowAdmin.helper');
const { emitTaskWorkflowUpdated } = require('../helpers/taskSocketEvents.helper');
const {
  toProjectSettingsDto,
  toWorkflowDto,
  toWorkflowStatusDto,
} = require('../dto/task.dto');
const taskErrorCodes = require('../errors/taskErrorCodes');
const { WORKFLOW_STATUS_CATEGORIES } = require('../constants/tasks.constants');

function wrapError(error, fallbackCode) {
  if (error instanceof AppError) return error;
  return new AppError(error.message || 'Workflow admin request failed', {
    status: error.status || 400,
    code: fallbackCode,
  });
}

async function loadProjectSettingsPayload(projectId, req) {
  const project = await taskAccessService.assertProjectExists(projectId);
  const { workflow, statuses } = await taskWorkflowService.getOrCreateProjectWorkflow(projectId);

  const [taskCount, memberCount, overdueCount] = await Promise.all([
    taskRepository.countByProject(projectId, { statusNe: 'archived' }),
    projectAssignmentRepository.countActiveMembers(projectId),
    taskRepository.countByProject(projectId, { overdue: true }),
  ]);

  return toProjectSettingsDto({
    project,
    workflow,
    statuses,
    stats: { taskCount, memberCount, overdueCount },
    canManage: canManageTasks(req),
  });
}

function emitWorkflowChange(projectId, workflow, statuses, action) {
  emitTaskWorkflowUpdated(projectId, {
    action,
    workflow: workflow ? toWorkflowDto(workflow) : null,
    statuses: (statuses || []).map(toWorkflowStatusDto),
  });
}

async function getProjectSettings(projectId, req) {
  return loadProjectSettingsPayload(projectId, req);
}

async function updateProjectSettings(projectId, payload, req) {
  if (!canManageTasks(req)) {
    throw new AppError('You do not have permission to manage this project', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
  }

  await taskAccessService.assertProjectExists(projectId);
  const updates = {};

  if (payload.name !== undefined && String(payload.name).trim()) {
    updates.name = String(payload.name).trim();
  }
  if (payload.description !== undefined) {
    updates.description = String(payload.description);
  }

  if (Object.keys(updates).length) {
    const updated = await projectRepository.updateProject(projectId, updates);
    if (!updated) {
      throw new AppError('Project not found', {
        status: 404,
        code: taskErrorCodes.TASK_PROJECT_NOT_FOUND,
      });
    }
  }

  return loadProjectSettingsPayload(projectId, req);
}

async function resolveWorkflowContext(projectId) {
  const { workflow, statuses } = await taskWorkflowService.getOrCreateProjectWorkflow(projectId);
  return { workflow, statuses };
}

async function addWorkflowStatus(projectId, payload, req) {
  if (!canManageTasks(req)) {
    throw new AppError('You do not have permission to manage workflow statuses', { status: 403 });
  }

  const name = String(payload?.name || '').trim();
  if (!name) {
    throw new AppError('name is required', { status: 400, code: taskErrorCodes.TASK_INVALID_PRIORITY });
  }

  const { workflow, statuses } = await resolveWorkflowContext(projectId);
  const duplicate = await taskWorkflowStatusRepository.findActiveDuplicateName(workflow._id, name);
  if (duplicate) {
    throw new AppError('A status with this name already exists', { status: 409 });
  }

  let key = slugifyStatusKey(name);
  let suffix = 1;
  while (await taskWorkflowStatusRepository.findActiveDuplicateKey(workflow._id, key)) {
    suffix += 1;
    key = `${slugifyStatusKey(name)}_${suffix}`;
  }

  const category = WORKFLOW_STATUS_CATEGORIES.includes(String(payload?.category))
    ? String(payload.category)
    : 'active';

  const created = await taskWorkflowStatusRepository.createStatus({
    workflowId: workflow._id,
    projectId,
    name,
    key,
    order: nextStatusOrder(statuses),
    category,
    color: payload?.color || '#64748B',
    icon: payload?.icon || null,
    isTerminal: Boolean(payload?.isTerminal),
    status: 'active',
  });

  const activeStatuses = await taskWorkflowStatusRepository.listByWorkflowId(workflow._id);
  emitWorkflowChange(projectId, workflow, activeStatuses, 'status.created');

  return toWorkflowStatusDto(created);
}

async function updateWorkflowStatus(projectId, statusId, payload, req) {
  if (!canManageTasks(req)) {
    throw new AppError('You do not have permission to manage workflow statuses', { status: 403 });
  }

  const { workflow } = await resolveWorkflowContext(projectId);
  const status = await taskWorkflowStatusRepository.findById(statusId, {
    workflowId: workflow._id,
    activeOnly: true,
  });

  if (!status) {
    throw new AppError('Status not found', {
      status: 404,
      code: taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND,
    });
  }

  const updates = {};

  if (payload.name !== undefined) {
    const trimmed = String(payload.name).trim();
    if (!trimmed) {
      throw new AppError('name cannot be empty', { status: 400 });
    }
    const duplicate = await taskWorkflowStatusRepository.findActiveDuplicateName(
      workflow._id,
      trimmed,
      statusId
    );
    if (duplicate) {
      throw new AppError('A status with this name already exists', { status: 409 });
    }
    updates.name = trimmed;
  }

  if (payload.color !== undefined) updates.color = payload.color;
  if (payload.icon !== undefined) updates.icon = payload.icon;
  if (payload.category !== undefined) {
    if (!WORKFLOW_STATUS_CATEGORIES.includes(String(payload.category))) {
      throw new AppError('Invalid workflow status category', { status: 400 });
    }
    updates.category = payload.category;
  }
  if (payload.isTerminal !== undefined) updates.isTerminal = Boolean(payload.isTerminal);

  const updated = await taskWorkflowStatusRepository.updateStatus(statusId, workflow._id, updates);
  if (!updated) {
    throw new AppError('Status not found', {
      status: 404,
      code: taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND,
    });
  }

  const activeStatuses = await taskWorkflowStatusRepository.listByWorkflowId(workflow._id);
  emitWorkflowChange(projectId, workflow, activeStatuses, 'status.updated');

  return toWorkflowStatusDto(updated);
}

async function reorderWorkflowStatuses(projectId, updates, req) {
  if (!canManageTasks(req)) {
    throw new AppError('You do not have permission to manage workflow statuses', { status: 403 });
  }

  const { workflow } = await resolveWorkflowContext(projectId);
  const activeStatuses = await taskWorkflowStatusRepository.listByWorkflowId(workflow._id);

  let normalized;
  try {
    normalized = assertReorderUpdates(
      updates,
      activeStatuses.map((row) => String(row._id))
    );
  } catch (error) {
    throw wrapError(error, taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND);
  }

  const reordered = await taskWorkflowStatusRepository.updateOrders(workflow._id, normalized);
  emitWorkflowChange(projectId, workflow, reordered, 'status.reordered');

  return reordered.map(toWorkflowStatusDto);
}

async function archiveWorkflowStatus(projectId, statusId, replacementStatusId, req) {
  if (!canManageTasks(req)) {
    throw new AppError('You do not have permission to manage workflow statuses', { status: 403 });
  }

  const { workflow } = await resolveWorkflowContext(projectId);
  const status = await taskWorkflowStatusRepository.findById(statusId, {
    workflowId: workflow._id,
    activeOnly: true,
  });

  if (!status) {
    throw new AppError('Status not found', {
      status: 404,
      code: taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND,
    });
  }

  const [activeCount, taskCount] = await Promise.all([
    taskWorkflowStatusRepository.countActiveByWorkflowId(workflow._id),
    taskRepository.countByWorkflowStatusId(statusId),
  ]);

  try {
    assertArchiveAllowed({
      activeStatusCount: activeCount,
      taskCountInStatus: taskCount,
      replacementStatusId,
    });
  } catch (error) {
    throw wrapError(error, taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND);
  }

  if (replacementStatusId) {
    const replacement = await taskWorkflowStatusRepository.findById(replacementStatusId, {
      workflowId: workflow._id,
      activeOnly: true,
    });

    if (!replacement) {
      throw new AppError('Replacement status not found or already archived', {
        status: 404,
        code: taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND,
      });
    }

    if (String(replacement._id) === String(statusId)) {
      throw new AppError('Replacement status must differ from archived status', { status: 400 });
    }

    if (taskCount > 0) {
      await taskRepository.moveTasksBetweenStatuses(statusId, replacementStatusId);
    }
  }

  const archived = await taskWorkflowStatusRepository.archiveStatus(statusId, workflow._id);
  if (!archived) {
    throw new AppError('Status not found', {
      status: 404,
      code: taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND,
    });
  }

  const activeStatuses = await taskWorkflowStatusRepository.listByWorkflowId(workflow._id);
  emitWorkflowChange(projectId, workflow, activeStatuses, 'status.archived');

  return toWorkflowStatusDto(archived);
}

module.exports = {
  getProjectSettings,
  updateProjectSettings,
  addWorkflowStatus,
  updateWorkflowStatus,
  reorderWorkflowStatuses,
  archiveWorkflowStatus,
};
