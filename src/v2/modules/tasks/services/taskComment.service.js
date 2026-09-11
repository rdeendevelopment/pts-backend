const { AppError } = require('../../../kernel/errors');
const taskErrorCodes = require('../errors/taskErrorCodes');
const userRepository = require('../../users/repositories/user.repository');
const taskRepository = require('../repositories/task.repository');
const taskCommentRepository = require('../repositories/taskComment.repository');
const taskActivityService = require('./taskActivity.service');
const taskNotificationService = require('./taskNotification.service');
const taskNotificationPolicy = require('./taskNotificationPolicy.service');
const { emitTaskCommentCreated } = require('../helpers/taskSocketEvents.helper');
const { assertTaskReadable, assertCanCommentOnTask } = require('../helpers/taskCollaboratorAccess.helper');
const { toCommentDto } = require('../dto/task.dto');
const { displayName, resolveAuthorsByAccountIds, authorFieldsFromMap } = require('../helpers/taskUser.helper');

async function listComments(taskId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  await assertTaskReadable(req, task);

  const comments = await taskCommentRepository.listByTaskId(taskId);
  const authorMap = await resolveAuthorsByAccountIds(comments.map((c) => c.authorId));

  return comments.map((comment) => ({
    ...toCommentDto(comment),
    ...authorFieldsFromMap(authorMap, comment.authorId),
  }));
}

async function createComment(taskId, payload, accountId, req) {
  const task = await taskRepository.findById(taskId);
  if (!task) {
    throw new AppError('Task not found', { status: 404, code: taskErrorCodes.TASK_NOT_FOUND });
  }
  if (task.status === 'archived') {
    throw new AppError('Archived tasks cannot be commented on', {
      status: 409,
      code: taskErrorCodes.TASK_INVALID_STATUS,
    });
  }
  await assertCanCommentOnTask(req, task);

  const content = String(payload.content || payload.text || '').trim();
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (!content && !attachments.length) {
    throw new AppError('Comment content or attachments required', {
      status: 400,
      code: taskErrorCodes.TASK_COMMENT_EMPTY,
    });
  }

  let parentComment = null;
  if (payload.parentCommentId) {
    parentComment = await taskCommentRepository.findById(payload.parentCommentId, taskId);
    if (!parentComment) {
      throw new AppError('Reply target must be an existing comment on this task', {
        status: 400,
        code: taskErrorCodes.TASK_COMMENT_NOT_FOUND,
      });
    }
  }

  const comment = await taskCommentRepository.createComment({
    taskId,
    projectId: task.projectId,
    authorId: accountId,
    content: content || '(attachment)',
    mentions: Array.isArray(payload.mentions) ? payload.mentions : [],
    attachments,
    parentCommentId: payload.parentCommentId || null,
  });

  const actorName = displayName(await userRepository.findByAccountId(accountId));
  let mentionNotifications = [];
  try {
    mentionNotifications = await taskNotificationService.notifyMentionsOnComment({
      task, comment, actorAccountId: accountId, actorName,
    });
  } catch (_) {
    // Mention delivery must not fail an otherwise valid comment.
  }

  if (parentComment) {
    await taskNotificationPolicy.commentReply(
      task, accountId, parentComment, comment, mentionNotifications.map((row) => row.receiverId)
    ).catch(() => {});
  }

  await taskRepository.incrementCommentCount(taskId, 1);

  await taskActivityService.logTaskActivity({
    taskId,
    projectId: task.projectId,
    eventType: 'TASK_COMMENT_ADDED',
    performedBy: accountId,
    metadata: { commentId: String(comment._id) },
  });

  const commentDto = {
    ...toCommentDto(comment),
    ...authorFieldsFromMap(
      await resolveAuthorsByAccountIds([accountId]),
      accountId,
    ),
  };
  emitTaskCommentCreated(task.projectId, taskId, commentDto);

  return commentDto;
}

module.exports = {
  listComments,
  createComment,
};
