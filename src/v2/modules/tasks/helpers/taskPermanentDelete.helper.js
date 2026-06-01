const { AppError } = require('../../../kernel/errors');
const taskErrorCodes = require('../errors/taskErrorCodes');
const { isTaskUploadUrl, deletePhysicalFileByPublicUrl } = require('./taskFileStorage.helper');

function assertPermanentDeleteAllowed(taskStatus) {
  if (taskStatus !== 'archived') {
    throw new AppError('Only archived tasks can be permanently deleted. Archive the task first.', {
      status: 400,
      code: taskErrorCodes.TASK_ARCHIVED_ONLY_DELETE,
    });
  }
}

function collectAttachmentUrls(attachments = []) {
  const urls = [];
  for (const item of attachments) {
    const url = item?.fileUrl || item?.url;
    if (url && isTaskUploadUrl(url)) urls.push(url);
  }
  return urls;
}

function collectTaskFileUrls(task, comments = []) {
  const urls = collectAttachmentUrls(task?.attachments || []);
  for (const comment of comments) {
    urls.push(...collectAttachmentUrls(comment?.attachments || []));
  }
  return [...new Set(urls)];
}

async function deleteTaskFilesBestEffort(urls = []) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        await deletePhysicalFileByPublicUrl(url);
      } catch (_) {
        // Best-effort cleanup only.
      }
    })
  );
}

module.exports = {
  assertPermanentDeleteAllowed,
  collectTaskFileUrls,
  deleteTaskFilesBestEffort,
};
