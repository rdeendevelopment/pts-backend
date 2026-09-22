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
const taskNotificationPolicy = require('./taskNotificationPolicy.service');
const { warn } = require('../../../kernel/logger');
const env = require('../../../config/env');

async function notifyBestEffort(operation, context = {}) {
  try { await operation(); } catch (err) {
    warn('Task notification delivery skipped', { ...context, message: err.message });
  }
}
const {
  assertCanMoveTask,
  assertCanCreateTaskOnProject,
} = require('../helpers/taskCollaboratorAccess.helper');
const {
  assertCanEditTask,
  assertCanArchiveTask,
  resolveTaskCapabilities,
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
const { parsePagination, buildPaginationMeta } = require('../helpers/taskAggregateQuery.helper');
const {
  isBoardShareClientUser,
  mapShareRoleToBoardCapabilities,
  mapShareRoleToTaskCapabilities,
  assertClientBoardShare,
  BOARD_SHARE_ACTIONS,
} = require('../helpers/taskBoardShareAccess.helper');
const { assertTaskReadable } = require('../helpers/taskCollaboratorAccess.helper');

async function syncMyDayForAssignees(task, previousStatus, performerAccountId) {
  if (!task?.assignees?.length) return;

  try {
    const { dailyFlowTaskSyncService } = require('../../daily-flow');
    const { resolveAccountIdForUserId } = require('../../daily-flow/helpers/account.helper');

    const assigneeIds = [...new Set(
      (task.assignees || []).map((assignee) => assignee.userId).filter(Boolean).map(String)
    )];

    await Promise.all(assigneeIds.map(async (userId) => {
      let assigneeAccountId = performerAccountId;
      try {
        assigneeAccountId = await resolveAccountIdForUserId(userId);
      } catch (_err) {
        assigneeAccountId = performerAccountId;
      }

      if (task.status === 'completed' && previousStatus !== 'completed') {
        await dailyFlowTaskSyncService.syncTaskCompleted(task._id, userId, assigneeAccountId);
      } else if (task.status === 'active' && previousStatus === 'completed') {
        await dailyFlowTaskSyncService.syncTaskReopened(task._id, userId, assigneeAccountId);
      }
    }));
  } catch (err) {
    const { warn } = require('../../../kernel/logger');
    warn('Task Board My Day sync skipped', {
      taskId: String(task?._id),
      message: err.message,
    });
  }
}

async function resolveReopenWorkflowStatus(workflowId) {
  const statuses = await taskWorkflowStatusRepository.listByWorkflowId(workflowId);
  return statuses.find((status) => status.key === 'in_progress' && !status.isTerminal)
    || statuses.find((status) => status.category === 'active' && !status.isTerminal)
    || statuses.find((status) => !status.isTerminal)
    || null;
}

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
      avatarUrl: user?.avatarUrl || user?.imageUrl || null,
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

async function getProjectBoard(projectId, filters = {}, req = null) {
  let capabilities = { canEditTasks: true, canComment: true, canCreateTask: true, canMoveTask: true };
  if (req && isBoardShareClientUser(req)) {
    const share = req.boardShare
      || await assertClientBoardShare(req, projectId, BOARD_SHARE_ACTIONS.VIEW_BOARD);
    capabilities = mapShareRoleToBoardCapabilities(share.role);
  } else if (req) {
    await taskAccessService.assertCanAccessProjectForTasks(req, projectId);
  }

  const project = await taskAccessService.assertProjectExists(projectId);
  const { workflow, statuses } = await taskWorkflowService.getOrCreateProjectWorkflow(projectId);
  const pagination = parsePagination(filters, { defaultLimit: 100 });

  const { items: tasks, total } = await taskRepository.listByProjectPage(projectId, {
    status: filters.status,
    statusNe: filters.status ? null : 'archived',
    workflowStatusId: filters.workflowStatusId || filters.statusId,
    assigneeUserId: filters.assigneeUserId,
    priority: filters.priority,
    search: filters.search,
  }, pagination);

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

  if (req?.v2Auth?.accountId) {
    const { getTodoModel } = require('../../todos/models/todo.model');
    const taskIds = Object.values(enrichedBoard).flat().map((task) => task.id || task._id).filter(Boolean);
    const now = new Date();
    const todoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const links = taskIds.length ? await getTodoModel().find({ createdBy: req.v2Auth.accountId, linkedTaskId: { $in: taskIds }, todoDate, isDeleted: false }).select('_id linkedTaskId').lean() : [];
    const linkMap = new Map(links.map((todo) => [String(todo.linkedTaskId), String(todo._id)]));
    for (const [statusId, list] of Object.entries(enrichedBoard)) {
      enrichedBoard[statusId] = list.map((task) => ({ ...task, myDayTodoId: linkMap.get(String(task.id || task._id)) || null }));
    }
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
    pagination: buildPaginationMeta({ ...pagination, total }),
    capabilities,
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

async function listArchivedTasks(projectId, filters = {}) {
  await taskAccessService.assertProjectExists(projectId);
  const pagination = parsePagination(filters, { defaultLimit: 100 });
  const { items, total } = await taskRepository.listByProjectPage(
    projectId,
    { status: 'archived', search: filters.search },
    pagination
  );
  const tasks = await Promise.all(items.map((task) => enrichTask(task)));
  return {
    items: tasks,
    pagination: buildPaginationMeta({ ...pagination, total }),
  };
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
  await assertCanCreateTaskOnProject(req, projectId);
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
  let requestedPrimary = env.v2.taskFeatures.primaryAssigneeWrites && payload.primaryAssigneeId
    ? await taskAccessService.resolveProjectMemberUserId(payload.primaryAssigneeId)
    : explicitAssigneeIds[0] || null;
  if (requestedPrimary) {
    await taskAccessService.assertUserHasProjectAccess(projectId, requestedPrimary);
  }
  const assigneeIds = [...explicitAssigneeIds];
  if (requestedPrimary && !assigneeIds.includes(String(requestedPrimary))) {
    assigneeIds.unshift(String(requestedPrimary));
  }
  const creatorOnProject = await projectsModule.getAssignmentForUser(projectId, creatorUserId);
  // Legacy unassigned creates still include their creator. Explicit accountability is never changed.
  if (creatorOnProject
      && !assigneeIds.includes(String(creatorUserId))
      && (!env.v2.taskFeatures.primaryAssigneeWrites || (!requestedPrimary && !assigneeIds.length))) {
    assigneeIds.push(String(creatorUserId));
    requestedPrimary = String(creatorUserId);
  }

  const validatedAssigneeIds = await taskAccessService.assertAssigneesOnProject(projectId, assigneeIds);
  const assignees = await buildAssignees(validatedAssigneeIds, accountId);
  const reviewerId = payload.reviewerId
    ? await taskAccessService.resolveProjectMemberUserId(payload.reviewerId)
    : null;
  if (reviewerId) await taskAccessService.assertUserHasProjectAccess(projectId, reviewerId);

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
    ...(env.v2.taskFeatures.primaryAssigneeWrites ? { primaryAssigneeId: requestedPrimary } : {}),
    reviewerId,
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
  await notifyBestEffort(() => taskNotificationPolicy.taskUpdated({
    before: { _id: task._id, projectId: task.projectId, assignees: [], primaryAssigneeId: null },
    after: task, actorId: accountId, fields: ['primaryAssigneeId'],
  }), { taskId: String(task._id), event: 'created' });
  emitTaskCreated(projectId, taskDto);
  return taskDto;
}

async function getTaskById(taskId, req = null) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', {
      status: 404,
      code: taskErrorCodes.TASK_NOT_FOUND,
    });
  }
  if (req) {
    await assertTaskReadable(req, task);
  }
  const taskDto = await enrichTask(task);
  if (req && isBoardShareClientUser(req)) {
    const shareRole = req.boardShare?.role || 'viewer';
    taskDto.capabilities = mapShareRoleToTaskCapabilities(shareRole);
  } else if (req) {
    taskDto.capabilities = await resolveTaskCapabilities(req, task);
  }
  return taskDto;
}

async function updateTask(taskId, payload, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  const capabilities = await assertCanEditTask(req, task);
  if (capabilities.collaboratorOnly
      && ['assigneeIds', 'primaryAssigneeId', 'reviewerId', 'attachments']
        .some((field) => payload[field] !== undefined)) {
    throw new AppError('Task collaborators cannot change responsibility or replace attachments', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
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

  if (payload.reviewerId !== undefined) {
    const reviewerId = payload.reviewerId
      ? await taskAccessService.resolveProjectMemberUserId(payload.reviewerId)
      : null;
    if (reviewerId) await taskAccessService.assertUserHasProjectAccess(task.projectId, reviewerId);
    updates.reviewerId = reviewerId;
  }

  if (payload.assigneeIds !== undefined && !(req && isBoardShareClientUser(req))) {
    const assigneeIds = await taskAccessService.assertAssigneesOnProject(
      task.projectId,
      payload.assigneeIds || [],
    );
    updates.assignees = await buildAssignees(assigneeIds, accountId);
    if (payload.primaryAssigneeId === undefined) {
      updates.primaryAssigneeId = assigneeIds[0] || null;
    }
  }

  if (env.v2.taskFeatures.primaryAssigneeWrites && payload.primaryAssigneeId !== undefined && !(req && isBoardShareClientUser(req))) {
    const primaryId = payload.primaryAssigneeId
      ? await taskAccessService.resolveProjectMemberUserId(payload.primaryAssigneeId)
      : null;
    if (primaryId) await taskAccessService.assertUserHasProjectAccess(task.projectId, primaryId);
    updates.primaryAssigneeId = primaryId;
    if (primaryId) {
      const legacyIds = (updates.assignees || task.assignees || []).map((a) => String(a.userId || a));
      const compatibleIds = [String(primaryId), ...legacyIds.filter((id) => id !== String(primaryId))];
      updates.assignees = await buildAssignees(compatibleIds, accountId);
    }
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
  await notifyBestEffort(() => taskNotificationPolicy.taskUpdated({
    before: task, after: updated, actorId: accountId, fields: Object.keys(updates),
  }), { taskId: String(taskId), event: 'updated' });
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
  const sourceStatus = await taskWorkflowStatusRepository.findById(task.workflowStatusId);

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
  const wasCompleted = task.status === 'completed';
  const isCompleted = updated.status === 'completed';
  if (!wasCompleted && isCompleted) {
    await notifyBestEffort(() => taskNotificationPolicy.lifecycle(
      updated, accountId, 'task_completed', 'Task was completed'
    ), { taskId: String(taskId), event: 'completed' });
  } else if (wasCompleted && !isCompleted) {
    await notifyBestEffort(() => taskNotificationPolicy.lifecycle(
      updated, accountId, 'task_reopened', 'Task was reopened'
    ), { taskId: String(taskId), event: 'reopened' });
  } else {
    await notifyBestEffort(() => taskNotificationPolicy.workflowMoved({
      before: { ...task.toObject(), workflowStatusName: sourceStatus?.name || '' },
      after: updated, targetStatus, actorId: accountId,
    }), { taskId: String(taskId), event: 'moved' });
  }
  emitTaskMoved(task.projectId, taskDto, {
    fromStatusId: String(task.workflowStatusId),
    toStatusId: String(workflowStatusId),
    statusName: targetStatus.name,
  });

  if (taskDto.status === 'completed') {
    emitTaskCompleted(task.projectId, taskDto);
  }

  await syncMyDayForAssignees(updated, task.status, accountId);

  return taskDto;
}

async function completeTask(taskId, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  if (req?.taskSystem !== true) await assertCanEditTask(req, task);
  if (task.status === 'completed') return enrichTask(task);

  const statuses = await taskWorkflowStatusRepository.listByWorkflowId(task.workflowId);
  const completedStatus = statuses.find((status) => status.category === 'done' && status.isTerminal);
  if (!completedStatus) {
    throw new AppError('Workflow has no completed status', {
      status: 409,
      code: taskErrorCodes.TASK_WORKFLOW_STATUS_NOT_FOUND,
    });
  }
  const maxOrder = await taskRepository.findMaxOrder(task.projectId, completedStatus._id, task._id);

  const updated = await taskRepository.updateTask(taskId, {
    status: 'completed',
    workflowStatusId: completedStatus._id,
    workflowOrder: (maxOrder?.workflowOrder || 0) + WORKFLOW_ORDER_STEP,
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
  await notifyBestEffort(() => taskNotificationPolicy.lifecycle(
    updated, accountId, 'task_completed', 'Task was completed'
  ), { taskId: String(taskId), event: 'completed' });
  emitTaskCompleted(task.projectId, taskDto);
  await syncMyDayForAssignees(updated, task.status, accountId);

  return taskDto;
}

async function reopenTask(taskId, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  if (req?.taskSystem !== true) await assertCanEditTask(req, task);

  if (task.status !== 'completed') {
    return enrichTask(task);
  }

  const previousStatus = task.status;
  const reopenStatus = await resolveReopenWorkflowStatus(task.workflowId);
  const updates = {
    status: 'active',
    completedAt: null,
    completedBy: null,
    updatedBy: accountId,
  };

  if (reopenStatus) {
    const maxOrder = await taskRepository.findMaxOrder(
      task.projectId,
      reopenStatus._id,
      task._id
    );
    updates.workflowStatusId = reopenStatus._id;
    updates.workflowOrder = (maxOrder?.workflowOrder || 0) + WORKFLOW_ORDER_STEP;
  }

  const updated = await taskRepository.updateTask(taskId, updates);

  await taskActivityService.logTaskActivity({
    taskId,
    projectId: task.projectId,
    eventType: 'TASK_UPDATED',
    performedBy: accountId,
    metadata: { action: 'reopened', fromStatus: previousStatus },
  });

  const taskDto = await enrichTask(updated);
  await notifyBestEffort(() => taskNotificationPolicy.lifecycle(
    updated, accountId, 'task_reopened', 'Task was reopened'
  ), { taskId: String(taskId), event: 'reopened' });
  emitTaskUpdated(task.projectId, taskDto);
  await syncMyDayForAssignees(updated, previousStatus, accountId);

  return taskDto;
}

async function archiveTask(taskId, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  if (req && isBoardShareClientUser(req)) {
    throw new AppError('You do not have permission to archive this task', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
  }
  await assertCanArchiveTask(req, task);

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
  await notifyBestEffort(() => taskNotificationPolicy.lifecycle(
    updated, accountId, 'task_archived', 'Task was archived'
  ), { taskId: String(taskId), event: 'archived' });
  emitTaskArchived(task.projectId, taskDto);
  return taskDto;
}

async function restoreTask(taskId, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  await assertCanArchiveTask(req, task);
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
  await notifyBestEffort(() => taskNotificationPolicy.lifecycle(
    updated, accountId, 'task_restored', 'Task was restored'
  ), { taskId: String(taskId), event: 'restored' });
  emitTaskRestored(task.projectId, taskDto);
  return taskDto;
}

async function permanentDeleteTask(taskId, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }

  await require('../helpers/taskMutationAccess.helper').assertTaskCapability(req, task, 'canDelete');

  assertPermanentDeleteAllowed(task.status);

  const deleteRecipients = await taskNotificationPolicy.participantIds(task);

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
    taskCollaboratorRepository.deleteByTaskId(taskId),
  ]);

  await taskRepository.hardDeleteById(taskId);
  await deleteTaskFilesBestEffort(fileUrls);

  emitTaskDeleted(task.projectId, { taskId: String(taskId) });

  await notifyBestEffort(() => taskNotificationPolicy.notifyRecipients(task, accountId, {
    type: 'task_deleted', message: 'Task was permanently deleted',
    recipientIds: deleteRecipients,
    dedupeKey: `${task._id}:deleted:${new Date().toISOString()}`,
  }), { taskId: String(taskId), event: 'deleted' });

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
  reopenTask,
  archiveTask,
  restoreTask,
  permanentDeleteTask,
};
