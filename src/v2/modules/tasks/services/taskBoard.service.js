const { AppError } = require('../../../kernel/errors');
const { WORKFLOW_ORDER_STEP } = require('../constants/tasks.constants');
const taskErrorCodes = require('../errors/taskErrorCodes');
const taskRepository = require('../repositories/task.repository');
const taskCommentRepository = require('../repositories/taskComment.repository');
const taskNotificationRepository = require('../repositories/taskNotification.repository');
const taskCollaboratorRepository = require('../repositories/taskCollaborator.repository');
const taskWorkflowStatusRepository = require('../repositories/taskWorkflowStatus.repository');
const taskAccessService = require('./taskAccess.service');
const projectsModule = require('../../projects');
const taskWorkflowService = require('./taskWorkflow.service');
const taskActivityService = require('./taskActivity.service');
const {
  assertCanMoveTask,
  assertCanCreateTaskOnProject,
} = require('../helpers/taskCollaboratorAccess.helper');
const {
  assertCanEditTask,
  assertCanArchiveTask,
} = require('../helpers/taskMutationAccess.helper');
const {
  displayName,
  resolveUsersByIds,
  resolveAuthorsByAccountIds,
  authorFieldsFromMap,
  buildAssignees,
} = require('../helpers/taskUser.helper');
const { deriveTaskKeyPrefix } = require('../helpers/taskKeyPrefix.helper');
const userRepository = require('../../users/repositories/user.repository');
const {
  toTaskDto,
  toWorkflowDto,
  toWorkflowStatusDto,
} = require('../dto/task.dto');
const {
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskMoved,
  emitTaskCompleted,
  emitTaskArchived,
  emitTaskRestored,
  emitTaskDeleted,
} = require('../helpers/taskSocketEvents.helper');
const {
  assertPermanentDeleteAllowed,
  collectTaskFileUrls,
  deleteTaskFilesBestEffort,
} = require('../helpers/taskPermanentDelete.helper');

async function enrichTask(task, projectHint = null) {
  if (!task) return null;
  const doc = task.toObject ? task.toObject() : task;
  const project = projectHint || await taskAccessService.assertProjectExists(doc.projectId);
  const taskKeyPrefix = deriveTaskKeyPrefix(project.name, project.code);

  const userIds = [
    ...(doc.assignees || []).map((a) => a.userId),
    doc.reviewerId,
  ].filter(Boolean);
  const userMap = await resolveUsersByIds(userIds.map(String));

  const accountIds = [doc.createdBy, doc.completedBy].filter(Boolean).map(String);
  const authorMap = await resolveAuthorsByAccountIds(accountIds);
  const creatorFields = doc.createdBy
    ? authorFieldsFromMap(authorMap, doc.createdBy)
    : { authorName: null, authorEmail: null };

  const assignees = (doc.assignees || []).map((a) => {
    const user = userMap[String(a.userId)];
    return {
      ...a,
      name: a.name || displayName(user),
      email: a.email || user?.email || '',
    };
  });
  return toTaskDto({
    ...doc,
    assignees,
    taskKeyPrefix,
    createdByName: creatorFields.authorName,
    createdByEmail: creatorFields.authorEmail,
  }, { taskKeyPrefix });
}

async function getProjectBoard(projectId, filters = {}) {
  const project = await taskAccessService.assertProjectExists(projectId);
  const { workflow, statuses } = await taskWorkflowService.getOrCreateProjectWorkflow(projectId);

  const tasks = await taskRepository.listByProject(projectId, {
    statusNe: 'archived',
    assigneeUserId: filters.assigneeUserId,
    priority: filters.priority,
  });

  const board = {};
  for (const status of statuses) {
    board[String(status._id)] = [];
  }

  for (const task of tasks) {
    const key = String(task.workflowStatusId);
    if (board[key]) {
      board[key].push(task);
    } else if (statuses[0]) {
      board[String(statuses[0]._id)].push(task);
    }
  }

  const enrichedBoard = {};
  for (const [statusId, list] of Object.entries(board)) {
    enrichedBoard[statusId] = await Promise.all(list.map((task) => enrichTask(task, project)));
  }

  const taskKeyPrefix = deriveTaskKeyPrefix(project.name, project.code);
  return {
    project: {
      id: String(project._id),
      name: project.name,
      status: project.status,
      taskKeyPrefix,
    },
    workflow: toWorkflowDto(workflow),
    statuses: statuses.map(toWorkflowStatusDto),
    board: enrichedBoard,
  };
}

async function getProjectWorkflow(projectId) {
  await taskAccessService.assertProjectExists(projectId);
  const result = await taskWorkflowService.getOrCreateProjectWorkflow(projectId);
  return {
    workflow: toWorkflowDto(result.workflow),
    statuses: result.statuses.map(toWorkflowStatusDto),
  };
}

async function listArchivedTasks(projectId) {
  await taskAccessService.assertProjectExists(projectId);
  const tasks = await taskRepository.listByProject(projectId, { status: 'archived' });
  return Promise.all(tasks.map((task) => enrichTask(task)));
}

async function resolveCreatorUserId(accountId) {
  const user = await userRepository.findByAccountId(accountId);
  if (!user) {
    throw new AppError('User profile not found for account', {
      status: 404,
      code: taskErrorCodes.TASK_USER_NOT_FOUND,
    });
  }
  return user._id;
}

async function createTask(projectId, payload, accountId, req) {
  await taskAccessService.assertProjectExists(projectId);
  if (req) {
    await assertCanCreateTaskOnProject(req, projectId);
  }
  const creatorUserId = await resolveCreatorUserId(accountId);

  const { statuses, workflow } = await taskWorkflowService.getOrCreateProjectWorkflow(projectId);

  let workflowStatusId = payload.workflowStatusId || payload.statusId;
  if (!workflowStatusId) {
    const todo = statuses.find((s) => s.key === 'todo')
      || statuses.find((s) => s.key === 'backlog')
      || statuses[0];
    workflowStatusId = todo?._id;
  }
  if (!workflowStatusId) {
    throw new AppError('No workflow statuses found for project', {
      status: 409,
      code: taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND,
    });
  }

  const maxOrder = await taskRepository.findMaxOrder(projectId, workflowStatusId);
  const maxNumber = await taskRepository.findMaxTaskNumber(projectId);

  const explicitAssigneeIds = await taskAccessService.normalizeAssigneeUserIds(
    payload.assigneeIds || payload.assignees || [],
  );
  const assigneeIds = [...explicitAssigneeIds];
  const creatorOnProject = await projectsModule.getAssignmentForUser(projectId, creatorUserId);
  if (creatorOnProject && !assigneeIds.includes(String(creatorUserId))) {
    assigneeIds.push(String(creatorUserId));
  }

  const validatedAssigneeIds = await taskAccessService.assertAssigneesOnProject(projectId, assigneeIds);
  const assignees = await buildAssignees(validatedAssigneeIds, accountId);

  const task = await taskRepository.createTask({
    projectId,
    workflowId: workflow._id,
    workflowStatusId,
    workflowOrder: (maxOrder?.workflowOrder || 0) + WORKFLOW_ORDER_STEP,
    taskNumber: (maxNumber?.taskNumber || 0) + 1,
    title: String(payload.title).trim(),
    description: payload.description || '',
    priority: payload.priority || 'none',
    tags: payload.tags || [],
    dueDate: payload.dueDate || null,
    startDate: payload.startDate || null,
    estimatedMinutes: payload.estimatedMinutes ?? null,
    assignees,
    reviewerId: payload.reviewerId || null,
    checklist: payload.checklist || [],
    attachments: payload.attachments || [],
    createdBy: accountId,
    updatedBy: accountId,
  });

  await taskActivityService.logTaskActivity({
    taskId: task._id,
    projectId,
    eventType: 'TASK_CREATED',
    title: task.title,
    performedBy: accountId,
  });

  const taskDto = await enrichTask(task);
  emitTaskCreated(projectId, taskDto);
  return taskDto;
}

async function getTaskById(taskId) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', {
      status: 404,
      code: taskErrorCodes.TASK_NOT_FOUND,
    });
  }
  return enrichTask(task);
}

async function updateTask(taskId, payload, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  if (req) {
    await assertCanEditTask(req, task);
  }
  if (task.status === 'archived') {
    throw new AppError('Archived tasks cannot be edited', {
      status: 409,
      code: taskErrorCodes.TASK_INVALID_STATUS,
    });
  }

  const updates = { updatedBy: accountId };
  const allowed = [
    'title', 'description', 'priority', 'tags', 'dueDate', 'startDate',
    'estimatedMinutes', 'reviewerId', 'checklist', 'attachments',
  ];
  for (const key of allowed) {
    if (payload[key] !== undefined) updates[key] = payload[key];
  }

  if (payload.assigneeIds !== undefined) {
    const assigneeIds = await taskAccessService.assertAssigneesOnProject(
      task.projectId,
      payload.assigneeIds || [],
    );
    updates.assignees = await buildAssignees(assigneeIds, accountId);
  }

  const updated = await taskRepository.updateTask(taskId, updates);

  await taskActivityService.logTaskActivity({
    taskId,
    projectId: task.projectId,
    eventType: 'TASK_UPDATED',
    performedBy: accountId,
    metadata: { fields: Object.keys(updates) },
  });

  const taskDto = await enrichTask(updated);
  emitTaskUpdated(task.projectId, taskDto);
  return taskDto;
}

async function moveTask(taskId, workflowStatusId, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  if (task.status === 'archived') {
    throw new AppError('Archived tasks cannot be moved', {
      status: 409,
      code: taskErrorCodes.TASK_INVALID_STATUS,
    });
  }
  await assertCanMoveTask(req, task);

  const targetStatus = await taskWorkflowStatusRepository.findById(
    workflowStatusId,
    { workflowId: task.workflowId }
  );
  if (!targetStatus) {
    throw new AppError('Workflow status not found', {
      status: 404,
      code: taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND,
    });
  }

  const maxOrder = await taskRepository.findMaxOrder(
    task.projectId,
    workflowStatusId,
    task._id
  );

  const updates = {
    workflowStatusId,
    workflowOrder: (maxOrder?.workflowOrder || 0) + WORKFLOW_ORDER_STEP,
    updatedBy: accountId,
  };

  if (targetStatus.isTerminal && targetStatus.category === 'done') {
    updates.status = 'completed';
    updates.completedAt = new Date();
    updates.completedBy = accountId;
  } else if (task.status === 'completed' && !targetStatus.isTerminal) {
    updates.status = 'active';
    updates.completedAt = null;
    updates.completedBy = null;
  }

  const updated = await taskRepository.updateTask(taskId, updates);

  await taskActivityService.logTaskActivity({
    taskId,
    projectId: task.projectId,
    eventType: 'TASK_MOVED',
    performedBy: accountId,
    metadata: {
      fromStatusId: String(task.workflowStatusId),
      toStatusId: String(workflowStatusId),
      statusName: targetStatus.name,
    },
  });

  const taskDto = await enrichTask(updated);
  emitTaskMoved(task.projectId, taskDto, {
    fromStatusId: String(task.workflowStatusId),
    toStatusId: String(workflowStatusId),
    statusName: targetStatus.name,
  });

  if (taskDto.status === 'completed') {
    emitTaskCompleted(task.projectId, taskDto);
  }

  return taskDto;
}

async function completeTask(taskId, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  if (req) {
    await assertCanEditTask(req, task);
  }

  const updated = await taskRepository.updateTask(taskId, {
    status: 'completed',
    completedAt: new Date(),
    completedBy: accountId,
    updatedBy: accountId,
  });

  await taskActivityService.logTaskActivity({
    taskId,
    projectId: task.projectId,
    eventType: 'TASK_COMPLETED',
    performedBy: accountId,
  });

  const taskDto = await enrichTask(updated);
  emitTaskCompleted(task.projectId, taskDto);
  return taskDto;
}

async function archiveTask(taskId, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  if (req) {
    await assertCanArchiveTask(req, task);
  }

  const updated = await taskRepository.updateTask(taskId, {
    status: 'archived',
    archivedAt: new Date(),
    updatedBy: accountId,
  });

  await taskActivityService.logTaskActivity({
    taskId,
    projectId: task.projectId,
    eventType: 'TASK_ARCHIVED',
    performedBy: accountId,
  });

  const taskDto = await enrichTask(updated);
  emitTaskArchived(task.projectId, taskDto);
  return taskDto;
}

async function restoreTask(taskId, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  if (req) {
    await assertCanArchiveTask(req, task);
  }
  if (task.status !== 'archived') {
    throw new AppError('Only archived tasks can be restored', {
      status: 409,
      code: taskErrorCodes.TASK_INVALID_STATUS,
    });
  }

  const updated = await taskRepository.updateTask(taskId, {
    status: 'active',
    archivedAt: null,
    updatedBy: accountId,
  });

  await taskActivityService.logTaskActivity({
    taskId,
    projectId: task.projectId,
    eventType: 'TASK_RESTORED',
    performedBy: accountId,
  });

  const taskDto = await enrichTask(updated);
  emitTaskRestored(task.projectId, taskDto);
  return taskDto;
}

async function permanentDeleteTask(taskId, accountId) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }

  assertPermanentDeleteAllowed(task.status);

  const comments = await taskCommentRepository.listByTaskId(taskId);
  const fileUrls = collectTaskFileUrls(task, comments);

  await taskActivityService.logTaskActivity({
    taskId,
    projectId: task.projectId,
    eventType: 'TASK_PERMANENTLY_DELETED',
    title: task.title,
    performedBy: accountId,
    metadata: {
      taskNumber: task.taskNumber,
      commentCount: comments.length,
    },
  });

  await Promise.all([
    taskCommentRepository.deleteByTaskId(taskId),
    taskNotificationRepository.deleteByTaskId(taskId),
    taskCollaboratorRepository.deleteByTaskId(taskId),
  ]);

  await taskRepository.hardDeleteById(taskId);
  await deleteTaskFilesBestEffort(fileUrls);

  emitTaskDeleted(task.projectId, { taskId: String(taskId) });

  return { deleted: true, taskId: String(taskId) };
}

module.exports = {
  enrichTask,
  getProjectBoard,
  getProjectWorkflow,
  listArchivedTasks,
  createTask,
  getTaskById,
  updateTask,
  moveTask,
  completeTask,
  archiveTask,
  restoreTask,
  permanentDeleteTask,
};
