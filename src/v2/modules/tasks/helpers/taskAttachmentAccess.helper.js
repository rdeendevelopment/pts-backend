const { AppError } = require('../../../kernel/errors');
const taskErrorCodes = require('../errors/taskErrorCodes');
const taskAccessService = require('../services/taskAccess.service');
const { assertTaskReadable } = require('./taskCollaboratorAccess.helper');
const { canManageTasks, resolveUserIdFromAuth } = require('./taskAccessScope.helper');

async function assertCanModifyAttachments(req, task) {
  if (!task) {
    throw new AppError('Task not found', {
      status: 404,
      code: taskErrorCodes.TASK_NOT_FOUND,
    });
  }

  if (task.status === 'archived') {
    throw new AppError('Archived tasks cannot be modified', {
      status: 409,
      code: taskErrorCodes.TASK_INVALID_STATUS,
    });
  }

  if (canManageTasks(req)) {
    return;
  }

  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  await taskAccessService.assertUserHasProjectAccess(task.projectId, userId);
}

async function assertCanUploadCommentAttachment(req, task) {
  if (!task) {
    throw new AppError('Task not found', {
      status: 404,
      code: taskErrorCodes.TASK_NOT_FOUND,
    });
  }

  if (task.status === 'archived') {
    throw new AppError('Archived tasks cannot be modified', {
      status: 409,
      code: taskErrorCodes.TASK_INVALID_STATUS,
    });
  }

  await assertTaskReadable(req, task);
}

module.exports = {
  assertCanModifyAttachments,
  assertCanUploadCommentAttachment,
};
