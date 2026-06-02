const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectService = require('../services/project.service');

async function listProjects(req, res) {
  const data = await projectService.listProjects(req.query, req);
  return sendSuccess(res, data);
}

async function getProjectById(req, res) {
  const projectId = assertObjectId(req.params.id, 'id');
  const data = await projectService.getProjectById(projectId, req);
  return sendSuccess(res, data);
}

async function createProject(req, res) {
  const body = { ...req.body };
  if (body.clientId) body.clientId = assertObjectId(body.clientId, 'clientId');
  const data = await projectService.createProject(body, req.v2Auth.accountId, req);
  return sendSuccess(res, data, { status: 201 });
}

async function updateProject(req, res) {
  const projectId = assertObjectId(req.params.id, 'id');
  const body = { ...req.body };
  if (body.clientId) body.clientId = assertObjectId(body.clientId, 'clientId');
  const data = await projectService.updateProject(projectId, body, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function updateProjectStatus(req, res) {
  const projectId = assertObjectId(req.params.id, 'id');
  const data = await projectService.updateProjectStatus(
    projectId,
    req.body.status,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data);
}

async function deleteProject(req, res) {
  const projectId = assertObjectId(req.params.id, 'id');
  const data = await projectService.deleteProject(projectId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function permanentDeleteProject(req, res) {
  const projectId = assertObjectId(req.params.id, 'id');
  const data = await projectService.permanentDeleteProject(
    projectId,
    req.v2Auth.accountId,
    req.body.password,
  );
  return sendSuccess(res, data);
}

module.exports = {
  listProjects: asyncHandler(listProjects),
  getProjectById: asyncHandler(getProjectById),
  createProject: asyncHandler(createProject),
  updateProject: asyncHandler(updateProject),
  updateProjectStatus: asyncHandler(updateProjectStatus),
  deleteProject: asyncHandler(deleteProject),
  permanentDeleteProject: asyncHandler(permanentDeleteProject),
};
