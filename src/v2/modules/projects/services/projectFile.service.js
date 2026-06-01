const projectFileRepository = require('../repositories/projectFile.repository');
const projectService = require('./project.service');
const projectStatsService = require('./projectStats.service');
const projectEventService = require('./projectEvent.service');
const { AppError } = require('../../../kernel/errors');
const projectErrorCodes = require('../errors/projectErrorCodes');
const { toProjectFileDto } = require('../dto/project.dto');
const { saveUploadedFiles } = require('../../../kernel/helpers/localFileUpload.helper');

async function getFileOrThrow(projectId, fileId) {
  const file = await projectFileRepository.findById(fileId, { projectId });
  if (!file) {
    throw new AppError('Project file not found', {
      status: 404,
      code: projectErrorCodes.PROJECT_FILE_NOT_FOUND,
    });
  }
  return file;
}

async function listFiles(projectId) {
  await projectService.getProjectOrThrow(projectId);
  const files = await projectFileRepository.listByProjectId(projectId);
  return files.map(toProjectFileDto);
}

async function createFile(projectId, payload, accountId, req = null) {
  await projectService.getProjectOrThrow(projectId);

  const fileName = String(payload.fileName || payload.file_name || '').trim();
  const fileUrl = String(payload.fileUrl || payload.file_url || '').trim();
  if (!fileName || !fileUrl) {
    throw new AppError('fileName and fileUrl are required', {
      status: 400,
      code: projectErrorCodes.PROJECT_FILE_NOT_FOUND,
    });
  }

  const file = await projectFileRepository.createFile({
    projectId,
    fileName,
    fileUrl,
    fileType: payload.fileType || payload.file_type || null,
    fileSize: payload.fileSize ?? payload.file_size ?? null,
    uploadedBy: accountId,
    createdBy: accountId,
    updatedBy: accountId,
  });

  await projectStatsService.recalculateStats(projectId);

  await projectEventService.recordEvent({
    projectId,
    eventType: 'PROJECT_FILE_ADDED',
    title: file.fileName,
    performedBy: accountId,
    metadata: { fileId: String(file._id) },
    req,
  });

  return toProjectFileDto(file);
}

async function deleteFile(projectId, fileId, accountId) {
  await projectService.getProjectOrThrow(projectId);
  await getFileOrThrow(projectId, fileId);

  await projectFileRepository.softDeleteFile(fileId, projectId, accountId);
  await projectStatsService.recalculateStats(projectId);
  return { deleted: true, id: String(fileId) };
}

async function uploadFiles(projectId, filesInput, accountId, req = null) {
  await projectService.getProjectOrThrow(projectId);
  const savedFiles = await saveUploadedFiles(filesInput);
  const created = [];

  for (const file of savedFiles) {
    created.push(await createFile(projectId, {
      fileName: file.title,
      fileUrl: file.url,
      fileSize: file.size,
    }, accountId, req));
  }

  return created;
}

module.exports = {
  listFiles,
  createFile,
  uploadFiles,
  deleteFile,
};
