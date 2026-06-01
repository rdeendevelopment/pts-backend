const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const userRepository = require('../../users/repositories/user.repository');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskErrorCodes = require('../errors/taskErrorCodes');
const taskRepository = require('../repositories/task.repository');
const taskCollaboratorRepository = require('../repositories/taskCollaborator.repository');
const taskActivityService = require('./taskActivity.service');
const { displayName, resolveUsersByIds } = require('../helpers/taskUser.helper');
const { toCollaboratorDto } = require('../dto/task.dto');
const { normalizeAccessType } = require('../helpers/taskCollaborator.helper');
const {
  assertTaskReadable,
  assertCanManageCollaborators,
  assertCanRemoveCollaborator,
} = require('../helpers/taskCollaboratorAccess.helper');

async function getTaskOrThrow(taskId) {
  const id = assertObjectId(taskId, 'taskId');
  const task = await taskRepository.findById(id);
  if (!task) {
    throw new AppError('Task not found', {
      status: 404,
      code: taskErrorCodes.TASK_NOT_FOUND,
    });
  }
  return task;
}

async function resolveCollaboratorUser(payload = {}) {
  if (payload.userId) {
    const user = await userRepository.findById(payload.userId);
    if (!user || user.isDeleted) {
      throw new AppError('User not found', {
        status: 404,
        code: taskErrorCodes.TASK_USER_NOT_FOUND,
      });
    }
    return user;
  }

  if (payload.email) {
    const user = await userRepository.findByEmail(payload.email);
    if (!user) {
      throw new AppError('User not found', {
        status: 404,
        code: taskErrorCodes.TASK_USER_NOT_FOUND,
      });
    }
    return user;
  }

  throw new AppError('email or userId is required', {
    status: 400,
    code: taskErrorCodes.TASK_USER_NOT_FOUND,
  });
}

async function assertUserNotProjectMember(projectId, userId) {
  const assignment = await projectAssignmentRepository.findByProjectAndUser(projectId, userId);
  if (assignment && assignment.status === 'active') {
    throw new AppError('User is already a project member', {
      status: 409,
      code: taskErrorCodes.TASK_COLLABORATOR_ALREADY_MEMBER,
    });
  }
}

async function listCollaborators(taskId, req) {
  const task = await getTaskOrThrow(taskId);
  await assertTaskReadable(req, task);

  const collaborators = await taskCollaboratorRepository.listActiveByTaskId(task._id);
  const userMap = await resolveUsersByIds(collaborators.map((row) => String(row.userId)));

  return collaborators.map((row) => toCollaboratorDto(row, userMap[String(row.userId)]));
}

async function addCollaborator(taskId, payload, accountId, req) {
  const task = await getTaskOrThrow(taskId);
  await assertCanManageCollaborators(req, task);

  const user = await resolveCollaboratorUser(payload);
  await assertUserNotProjectMember(task.projectId, user._id);

  const accessType = normalizeAccessType(payload.accessType);
  const existing = await taskCollaboratorRepository.findByTaskAndUser(task._id, user._id);
  const wasActive = Boolean(existing?.isActive);

  const collaborator = await taskCollaboratorRepository.upsertActive({
    taskId: task._id,
    projectId: task.projectId,
    userId: user._id,
    accessType,
    addedBy: accountId,
  });

  await taskActivityService.logTaskActivity({
    taskId: task._id,
    projectId: task.projectId,
    eventType: wasActive ? 'COLLABORATOR_UPDATED' : 'COLLABORATOR_ADDED',
    performedBy: accountId,
    metadata: {
      userId: String(user._id),
      accessType,
    },
  });

  return toCollaboratorDto(collaborator, user);
}

async function removeCollaborator(taskId, userId, accountId, req) {
  const task = await getTaskOrThrow(taskId);
  const targetUserId = assertObjectId(userId, 'userId');
  await assertCanRemoveCollaborator(req, task, targetUserId);

  const collaborator = await taskCollaboratorRepository.deactivateByTaskAndUser(task._id, targetUserId);
  if (!collaborator) {
    throw new AppError('Collaborator not found', {
      status: 404,
      code: taskErrorCodes.TASK_COLLABORATOR_NOT_FOUND,
    });
  }

  await taskActivityService.logTaskActivity({
    taskId: task._id,
    projectId: task.projectId,
    eventType: 'COLLABORATOR_REMOVED',
    performedBy: accountId,
    metadata: { userId: String(targetUserId) },
  });

  return { success: true, userId: String(targetUserId) };
}

module.exports = {
  listCollaborators,
  addCollaborator,
  removeCollaborator,
};
