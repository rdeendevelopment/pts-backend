const { sendSuccess } = require('../../../kernel/responses');
const workspaceService = require('../services/workspace.service');

async function createWorkspace(req, res) {
  const data = await workspaceService.createWorkspace(req.v2Auth.accountId, req.v2Auth.accountId, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listWorkspaces(req, res) {
  const data = await workspaceService.listWorkspaces(req.v2Auth.accountId, req.v2Auth.accountId, req.query);
  return sendSuccess(res, data);
}

async function getWorkspace(req, res) {
  const data = await workspaceService.getWorkspace(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id);
  return sendSuccess(res, data);
}

async function updateWorkspace(req, res) {
  const data = await workspaceService.updateWorkspace(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data);
}

module.exports = {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
};
