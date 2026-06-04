const { asyncHandler } = require('../../../kernel/middleware');
const taskAccessService = require('../services/taskAccess.service');
const taskRepository = require('../repositories/task.repository');
const { AppError } = require('../../../kernel/errors');
const taskErrorCodes = require('../errors/taskErrorCodes');
const {
  BOARD_SHARE_ACTIONS,
  assertClientBoardShare,
  isBoardShareClientUser,
  rejectClientUsers,
} = require('../helpers/taskBoardShareAccess.helper');

const rejectClientPortalUser = rejectClientUsers();

function projectAccess(action = BOARD_SHARE_ACTIONS.VIEW_BOARD) {
  return asyncHandler(async (req, res, next) => {
    const projectId = req.params.projectId;
    if (isBoardShareClientUser(req)) {
      await assertClientBoardShare(req, projectId, action);
      await taskAccessService.assertProjectExists(projectId);
      return next();
    }
    await taskAccessService.assertCanAccessProjectForTasks(req, projectId);
    return next();
  });
}

const assertProjectTaskAccess = projectAccess(BOARD_SHARE_ACTIONS.VIEW_BOARD);

function assertTaskAccess(action = BOARD_SHARE_ACTIONS.VIEW_TASK) {
  return asyncHandler(async (req, res, next) => {
    const taskId = req.params.taskId;
    const task = await taskRepository.findById(taskId);
    if (!task) {
      throw new AppError('Task not found', {
        status: 404,
        code: taskErrorCodes.TASK_NOT_FOUND,
      });
    }
    req.task = task;
    if (isBoardShareClientUser(req)) {
      await assertClientBoardShare(req, task.projectId, action);
      return next();
    }
    await taskAccessService.assertCanAccessProjectForTasks(req, task.projectId);
    return next();
  });
}

module.exports = {
  rejectClientPortalUser,
  projectAccess,
  assertProjectTaskAccess,
  assertTaskAccess,
};
