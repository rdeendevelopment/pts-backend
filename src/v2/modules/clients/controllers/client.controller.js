const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const clientService = require('../services/client.service');

async function listClients(req, res) {
  const data = await clientService.listClients(req.query);
  return sendSuccess(res, data);
}

async function getClientById(req, res) {
  const clientId = assertObjectId(req.params.id, 'id');
  const data = await clientService.getClientById(clientId);
  return sendSuccess(res, data);
}

async function createClient(req, res) {
  const data = await clientService.createClient(req.body, req.v2Auth.accountId);
  return sendSuccess(res, data, { status: 201 });
}

async function updateClient(req, res) {
  const clientId = assertObjectId(req.params.id, 'id');
  const data = await clientService.updateClient(clientId, req.body, req.v2Auth.accountId);
  return sendSuccess(res, data);
}

async function updateClientStatus(req, res) {
  const clientId = assertObjectId(req.params.id, 'id');
  const data = await clientService.updateClientStatus(
    clientId,
    req.body.status,
    req.v2Auth.accountId
  );
  return sendSuccess(res, data);
}

async function deleteClient(req, res) {
  const clientId = assertObjectId(req.params.id, 'id');
  const data = await clientService.deleteClient(clientId, req.v2Auth.accountId);
  return sendSuccess(res, data);
}

module.exports = {
  listClients: asyncHandler(listClients),
  getClientById: asyncHandler(getClientById),
  createClient: asyncHandler(createClient),
  updateClient: asyncHandler(updateClient),
  updateClientStatus: asyncHandler(updateClientStatus),
  deleteClient: asyncHandler(deleteClient),
};
