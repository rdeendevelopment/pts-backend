const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const moduleService = require('../services/module.service');

async function listModules(req, res) {
  const data = await moduleService.listModules(req.query);
  return sendSuccess(res, data);
}

async function getModule(req, res) {
  const moduleId = assertObjectId(req.params.id, 'id');
  const data = await moduleService.getModuleById(moduleId);
  return sendSuccess(res, data);
}

async function createModule(req, res) {
  const data = await moduleService.createModule(req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function updateModule(req, res) {
  const moduleId = assertObjectId(req.params.id, 'id');
  const data = await moduleService.updateModule(moduleId, req.body);
  return sendSuccess(res, data);
}

async function deleteModule(req, res) {
  const moduleId = assertObjectId(req.params.id, 'id');
  const data = await moduleService.deleteModule(moduleId);
  return sendSuccess(res, data);
}

async function updateModuleByKey(req, res) {
  const data = await moduleService.updateModuleByKey(req.params.key, req.body);
  return sendSuccess(res, data);
}

module.exports = {
  listModules: asyncHandler(listModules),
  getModule: asyncHandler(getModule),
  createModule: asyncHandler(createModule),
  updateModule: asyncHandler(updateModule),
  updateModuleByKey: asyncHandler(updateModuleByKey),
  deleteModule: asyncHandler(deleteModule),
};
