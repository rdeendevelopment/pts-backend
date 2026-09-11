const { AppError } = require('../../../kernel/errors');
const taskErrorCodes = require('../errors/taskErrorCodes');
const { assertTaskReadable } = require('./taskCollaboratorAccess.helper');
const { assertCanCommentOnTask, assertTaskCapability } = require('./taskMutationAccess.helper');
const { isBoardShareClientUser } = require('./taskBoardShareAccess.helper');

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

  await assertTaskCapability(req, task, 'canUploadAttachment');
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

  if (isBoardShareClientUser(req)) {
    await assertCanCommentOnTask(req, task);
    return;
  }

  await assertTaskReadable(req, task);
}

module.exports = {
  assertCanModifyAttachments,
  assertCanUploadCommentAttachment,
};
