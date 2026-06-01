const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectFileService = require('../services/projectFile.service');

async function listFiles(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await projectFileService.listFiles(projectId);
  return sendSuccess(res, { items: data });
}

async function createFile(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await projectFileService.createFile(
    projectId,
    req.body,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data, { status: 201 });
}

async function deleteFile(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const fileId = assertObjectId(req.params.fileId, 'fileId');
  const data = await projectFileService.deleteFile(projectId, fileId, req.v2Auth.accountId);
  return sendSuccess(res, data);
}

async function uploadFiles(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await projectFileService.uploadFiles(
    projectId,
    req.files,
    req.v2Auth.accountId,
    req,
  );
  return sendSuccess(res, { items: data }, { status: 201 });
}

module.exports = {
  listFiles: asyncHandler(listFiles),
  createFile: asyncHandler(createFile),
  uploadFiles: asyncHandler(uploadFiles),
  deleteFile: asyncHandler(deleteFile),
};
