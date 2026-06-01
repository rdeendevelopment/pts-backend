const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const taskErrorCodes = require('../errors/taskErrorCodes');
const taskRepository = require('../repositories/task.repository');
const taskActivityService = require('./taskActivity.service');
const { enrichTask } = require('./taskBoard.service');
const { emitTaskUpdated } = require('../helpers/taskSocketEvents.helper');
const { assertCanModifyAttachments, assertCanUploadCommentAttachment } = require('../helpers/taskAttachmentAccess.helper');
const {
  MAX_SIZE_BYTES,
  isAllowed,
  persistExpressFileUpload,
  isTaskUploadUrl,
  deletePhysicalFileByPublicUrl,
} = require('../helpers/taskFileStorage.helper');
const { toAttachmentDto, toCommentAttachmentDto } = require('../dto/task.dto');

function getUploadedFile(req) {
  return req.files?.file || null;
}

async function uploadTaskAttachment(taskId, req) {
  const id = assertObjectId(taskId, 'taskId');
  const task = await taskRepository.findById(id);
  await assertCanModifyAttachments(req, task);

  const file = getUploadedFile(req);
  if (!file) {
    throw new AppError('No file provided. Use field name "file".', {
      status: 400,
      code: taskErrorCodes.TASK_ATTACHMENT_INVALID_FILE,
    });
  }

  if (file.size > MAX_SIZE_BYTES) {
    const mb = Math.round(MAX_SIZE_BYTES / (1024 * 1024));
    throw new AppError(`File too large. Maximum size is ${mb} MB.`, {
      status: 413,
      code: taskErrorCodes.TASK_ATTACHMENT_INVALID_FILE,
    });
  }

  if (!isAllowed(file.mimetype, file.name)) {
    throw new AppError('File type not allowed', {
      status: 415,
      code: taskErrorCodes.TASK_ATTACHMENT_INVALID_FILE,
    });
  }

  const stored = await persistExpressFileUpload(file);
  const attachment = {
    fileName: stored.fileName,
    fileUrl: stored.fileUrl,
    mimeType: stored.mimeType,
    fileSize: stored.fileSize,
    uploadedBy: req.v2Auth.accountId,
    uploadedAt: new Date(),
  };

  const updated = await taskRepository.pushAttachment(id, attachment, {
    updatedBy: req.v2Auth.accountId,
  });

  if (!updated) {
    throw new AppError('Task not found', {
      status: 404,
      code: taskErrorCodes.TASK_NOT_FOUND,
    });
  }

  const saved = updated.attachments[updated.attachments.length - 1];
  const attachmentDto = toAttachmentDto(saved);

  await taskActivityService.logTaskActivity({
    taskId: id,
    projectId: task.projectId,
    eventType: 'TASK_UPDATED',
    performedBy: req.v2Auth.accountId,
    metadata: {
      attachmentId: attachmentDto.id,
      action: 'attachment_added',
      fileName: attachmentDto.fileName,
    },
  });

  const taskDto = await enrichTask(updated);
  emitTaskUpdated(task.projectId, taskDto);

  return attachmentDto;
}

async function uploadCommentAttachment(taskId, req) {
  const id = assertObjectId(taskId, 'taskId');
  const task = await taskRepository.findById(id);
  await assertCanUploadCommentAttachment(req, task);

  const file = getUploadedFile(req);
  if (!file) {
    throw new AppError('No file provided. Use field name "file".', {
      status: 400,
      code: taskErrorCodes.TASK_ATTACHMENT_INVALID_FILE,
    });
  }

  if (file.size > MAX_SIZE_BYTES) {
    const mb = Math.round(MAX_SIZE_BYTES / (1024 * 1024));
    throw new AppError(`File too large. Maximum size is ${mb} MB.`, {
      status: 413,
      code: taskErrorCodes.TASK_ATTACHMENT_INVALID_FILE,
    });
  }

  if (!isAllowed(file.mimetype, file.name)) {
    throw new AppError('File type not allowed', {
      status: 415,
      code: taskErrorCodes.TASK_ATTACHMENT_INVALID_FILE,
    });
  }

  const stored = await persistExpressFileUpload(file);
  return toCommentAttachmentDto(stored);
}

async function deleteTaskAttachment(taskId, attachmentId, req) {
  const id = assertObjectId(taskId, 'taskId');
  const attId = assertObjectId(attachmentId, 'attachmentId');

  const task = await taskRepository.findById(id);
  await assertCanModifyAttachments(req, task);

  const result = await taskRepository.removeAttachment(id, attId, {
    updatedBy: req.v2Auth.accountId,
  });

  if (!result) {
    const stillExists = await taskRepository.findById(id);
    if (!stillExists) {
      throw new AppError('Task not found', {
        status: 404,
        code: taskErrorCodes.TASK_NOT_FOUND,
      });
    }
    throw new AppError('Attachment not found', {
      status: 404,
      code: taskErrorCodes.TASK_ATTACHMENT_NOT_FOUND,
    });
  }

  if (isTaskUploadUrl(result.removed.fileUrl)) {
    await deletePhysicalFileByPublicUrl(result.removed.fileUrl);
  }

  await taskActivityService.logTaskActivity({
    taskId: id,
    projectId: task.projectId,
    eventType: 'TASK_UPDATED',
    performedBy: req.v2Auth.accountId,
    metadata: {
      attachmentId: result.removed.attachmentId,
      action: 'attachment_deleted',
    },
  });

  const taskDto = await enrichTask(result.task);
  emitTaskUpdated(task.projectId, taskDto);

  return {
    deleted: true,
    attachmentId: result.removed.attachmentId,
  };
}

module.exports = {
  uploadTaskAttachment,
  uploadCommentAttachment,
  deleteTaskAttachment,
};
