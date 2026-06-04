const { AppError } = require('../../../kernel/errors');
const taskErrorCodes = require('../errors/taskErrorCodes');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskMemberRepository = require('../repositories/taskMember.repository');
const taskCollaboratorRepository = require('../repositories/taskCollaborator.repository');
const {
  canManageTasks,
  resolveUserIdFromAuth,
} = require('./taskAccessScope.helper');
const {
  isBoardShareClientUser,
  mapShareRoleToTaskCapabilities,
} = require('./taskBoardShareAccess.helper');
const {
  mapAssignmentRoleToEditorRole,
  canEditProjectWithRole,
  normalizeAccessType,
} = require('./taskCollaborator.helper');

async function resolveProjectEditorRole(projectId, userId) {
  const taskMember = await taskMemberRepository.findByProjectAndUser(projectId, userId);
  if (taskMember?.role) return taskMember.role;

  const assignment = await projectAssignmentRepository.findByProjectAndUser(projectId, userId);
  if (!assignment) return null;
  return mapAssignmentRoleToEditorRole(assignment.role);
}

async function resolveTaskCapabilities(req, task) {
  if (!task) {
    return {
      canRead: false,
      canComment: false,
      canEdit: false,
      canMove: false,
      canArchive: false,
      collaboratorOnly: false,
    };
  }

  if (req && isBoardShareClientUser(req)) {
    const shareRole = req.boardShare?.role || 'viewer';
    const caps = mapShareRoleToTaskCapabilities(shareRole);
    return {
      canRead: true,
      canComment: caps.canComment,
      canEdit: caps.canEdit,
      canMove: caps.canMove,
      canArchive: false,
      collaboratorOnly: false,
      shareRole,
      isClientPortal: true,
    };
  }

  if (canManageTasks(req)) {
    return {
      canRead: true,
      canComment: true,
      canEdit: true,
      canMove: true,
      canArchive: true,
      collaboratorOnly: false,
    };
  }

  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const role = await resolveProjectEditorRole(task.projectId, userId);

  if (canEditProjectWithRole(role)) {
    return {
      canRead: true,
      canComment: true,
      canEdit: true,
      canMove: true,
      canArchive: true,
      collaboratorOnly: false,
      role,
    };
  }

  if (role === 'viewer') {
    return {
      canRead: true,
      canComment: false,
      canEdit: false,
      canMove: false,
      canArchive: false,
      collaboratorOnly: false,
      role,
    };
  }

  const collaborator = await taskCollaboratorRepository.findActiveByTaskAndUser(task._id, userId);
  if (collaborator) {
    const accessType = normalizeAccessType(collaborator.accessType);
    const canEdit = accessType === 'edit';
    return {
      canRead: true,
      canComment: ['comment', 'review', 'edit'].includes(accessType),
      canEdit,
      canMove: canEdit,
      canArchive: false,
      collaboratorOnly: true,
      accessType,
    };
  }

  return {
    canRead: false,
    canComment: false,
    canEdit: false,
    canMove: false,
    canArchive: false,
    collaboratorOnly: false,
  };
}

function denyUnless(capability, message) {
  if (!capability) {
    throw new AppError(message, {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
  }
}

async function assertCanMoveTask(req, task) {
  const caps = await resolveTaskCapabilities(req, task);
  denyUnless(caps.canMove, 'You do not have permission to move this task');
}

async function assertCanEditTask(req, task) {
  const caps = await resolveTaskCapabilities(req, task);
  denyUnless(caps.canEdit, 'You do not have permission to edit this task');
}

async function assertCanCommentOnTask(req, task) {
  const caps = await resolveTaskCapabilities(req, task);
  denyUnless(caps.canComment, 'You do not have permission to comment on this task');
}

async function assertCanArchiveTask(req, task) {
  const caps = await resolveTaskCapabilities(req, task);
  denyUnless(caps.canArchive, 'You do not have permission to archive this task');
}

module.exports = {
  resolveTaskCapabilities,
  assertCanMoveTask,
  assertCanEditTask,
  assertCanCommentOnTask,
  assertCanArchiveTask,
};
