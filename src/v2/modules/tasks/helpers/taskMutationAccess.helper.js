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
const env = require('../../../config/env');

async function resolveProjectEditorRole(projectId, userId) {
  const taskMember = await taskMemberRepository.findByProjectAndUser(projectId, userId);
  if (taskMember?.role) return taskMember.role;

  const assignment = await projectAssignmentRepository.findByProjectAndUser(projectId, userId);
  if (!assignment || assignment.status !== 'active') return null;
  return mapAssignmentRoleToEditorRole(assignment.role);
}

async function resolveTaskCapabilities(req, task) {
  const none = {
    canView: false, canRead: false, canComment: false,
    canUploadAttachment: false, canDeleteOwnAttachment: false,
    canEdit: false, canMove: false, canComplete: false, canReopen: false,
    canArchive: false, canRestore: false, canDelete: false,
    canManageCollaborators: false, collaboratorOnly: false,
  };
  if (!task) {
    return none;
  }

  if (req && isBoardShareClientUser(req)) {
    const shareRole = req.boardShare?.role || 'viewer';
    const caps = mapShareRoleToTaskCapabilities(shareRole);
    return {
      ...none, canView: true, canRead: true,
      canComment: caps.canComment,
      canUploadAttachment: caps.canEdit,
      canDeleteOwnAttachment: caps.canEdit,
      canEdit: caps.canEdit,
      canMove: caps.canMove,
      canComplete: caps.canMove,
      canReopen: caps.canMove,
      canArchive: false,
      collaboratorOnly: false,
      shareRole,
      isClientPortal: true,
    };
  }

  if (canManageTasks(req)) {
    return {
      ...none, canView: true, canRead: true,
      canComment: true,
      canUploadAttachment: true, canDeleteOwnAttachment: true,
      canEdit: true,
      canMove: true, canComplete: true, canReopen: true,
      canArchive: true, canRestore: true, canDelete: true,
      canManageCollaborators: true,
      collaboratorOnly: false,
    };
  }

  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const role = await resolveProjectEditorRole(task.projectId, userId);

  if (canEditProjectWithRole(role)) {
    return {
      ...none, canView: true, canRead: true,
      canComment: true,
      canUploadAttachment: true, canDeleteOwnAttachment: true,
      canEdit: true,
      canMove: true, canComplete: true, canReopen: true,
      canArchive: true, canRestore: true, canDelete: false,
      canManageCollaborators: true,
      collaboratorOnly: false,
      role,
    };
  }

  if (role === 'viewer') {
    return {
      ...none, canView: true, canRead: true,
      canComment: false,
      canEdit: false,
      canMove: false,
      canArchive: false,
      collaboratorOnly: false,
      role,
    };
  }

  const collaborator = env.v2.taskFeatures.collaboratorAccess
    ? await taskCollaboratorRepository.findActiveByTaskAndUser(task._id, userId) : null;
  if (collaborator) {
    const accessType = normalizeAccessType(collaborator.accessType);
    const canEdit = accessType === 'edit';
    return {
      ...none, canView: true, canRead: true,
      canComment: ['comment', 'review', 'edit'].includes(accessType),
      canUploadAttachment: true,
      canDeleteOwnAttachment: true,
      canEdit,
      canMove: canEdit,
      canComplete: canEdit,
      canReopen: canEdit,
      collaboratorOnly: true,
      accessType,
    };
  }

  return none;
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
  return caps;
}

async function assertCanCommentOnTask(req, task) {
  const caps = await resolveTaskCapabilities(req, task);
  denyUnless(caps.canComment, 'You do not have permission to comment on this task');
}

async function assertCanArchiveTask(req, task) {
  const caps = await resolveTaskCapabilities(req, task);
  denyUnless(caps.canArchive, 'You do not have permission to archive this task');
}

async function assertTaskCapability(req, task, capability) {
  const caps = await resolveTaskCapabilities(req, task);
  const aliases = { canRead: 'canView' };
  const key = aliases[capability] || capability;
  denyUnless(caps[key], 'You do not have permission to perform this task action');
  return caps;
}

module.exports = {
  resolveTaskCapabilities,
  assertCanMoveTask,
  assertCanEditTask,
  assertCanCommentOnTask,
  assertCanArchiveTask,
  assertTaskCapability,
};
