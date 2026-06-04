const { AppError } = require('../../../kernel/errors');
const taskErrorCodes = require('../errors/taskErrorCodes');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskMemberRepository = require('../repositories/taskMember.repository');
const {
  canManageTasks,
  resolveUserIdFromAuth,
} = require('./taskAccessScope.helper');
const {
  mapAssignmentRoleToEditorRole,
  canEditProjectWithRole,
} = require('./taskCollaborator.helper');
const {
  isBoardShareClientUser,
  assertClientBoardShare,
  BOARD_SHARE_ACTIONS,
  roleAllowsAction,
} = require('./taskBoardShareAccess.helper');

async function resolveProjectEditorRole(projectId, userId) {
  const taskMember = await taskMemberRepository.findByProjectAndUser(projectId, userId);
  if (taskMember?.role) return taskMember.role;

  const assignment = await projectAssignmentRepository.findByProjectAndUser(projectId, userId);
  if (!assignment) return null;
  return mapAssignmentRoleToEditorRole(assignment.role);
}

const {
  resolveTaskCapabilities,
  assertCanMoveTask,
  assertCanCommentOnTask,
} = require('./taskMutationAccess.helper');

async function assertTaskReadable(req, task) {
  const caps = await resolveTaskCapabilities(req, task);
  if (!caps.canRead) {
    throw new AppError('Access denied', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
  }
}

async function assertCanManageCollaborators(req, task) {
  if (canManageTasks(req)) return;
  if (isBoardShareClientUser(req)) {
    throw new AppError('You do not have permission to manage collaborators', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
  }

  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const role = await resolveProjectEditorRole(task.projectId, userId);
  if (canEditProjectWithRole(role)) return;

  if (String(task.createdBy) === String(req.v2Auth.accountId)) return;

  throw new AppError('You do not have permission to manage collaborators', {
    status: 403,
    code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
  });
}

async function assertCanRemoveCollaborator(req, task, targetUserId) {
  const actorUserId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  if (String(targetUserId) === String(actorUserId)) return;

  return assertCanManageCollaborators(req, task);
}

async function assertCanCreateTaskOnProject(req, projectId) {
  if (canManageTasks(req)) return;

  if (isBoardShareClientUser(req)) {
    const share = req.boardShare
      || await assertClientBoardShare(req, projectId, BOARD_SHARE_ACTIONS.CREATE_TASK);
    if (!roleAllowsAction(share.role, BOARD_SHARE_ACTIONS.CREATE_TASK)) {
      throw new AppError('You do not have permission to create tasks on this project', {
        status: 403,
        code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
      });
    }
    return;
  }

  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const role = await resolveProjectEditorRole(projectId, userId);
  if (!canEditProjectWithRole(role)) {
    throw new AppError('You do not have permission to create tasks on this project', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
    });
  }
}

module.exports = {
  assertTaskReadable,
  assertCanCreateTaskOnProject,
  assertCanManageCollaborators,
  assertCanRemoveCollaborator,
  assertCanMoveTask,
  assertCanCommentOnTask,
  resolveProjectEditorRole,
  resolveTaskCapabilities,
};
