const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const clientContactService = require('../services/clientContact.service');

async function listClientContacts(req, res) {
  const clientId = assertObjectId(req.params.clientId, 'clientId');
  const data = await clientContactService.listClientContacts(clientId, req.query);
  return sendSuccess(res, data);
}

async function createClientContact(req, res) {
  const clientId = assertObjectId(req.params.clientId, 'clientId');
  const data = await clientContactService.createClientContact(clientId, req.body, req.v2Auth.accountId);
  return sendSuccess(res, data, { status: 201 });
}

async function updateClientContact(req, res) {
  const contactId = assertObjectId(req.params.contactId, 'contactId');
  const data = await clientContactService.updateClientContact(contactId, req.body, req.v2Auth.accountId);
  return sendSuccess(res, data);
}

async function updateClientContactStatus(req, res) {
  const contactId = assertObjectId(req.params.contactId, 'contactId');
  const data = await clientContactService.updateClientContactStatus(
    contactId,
    req.body.status,
    req.v2Auth.accountId
  );
  return sendSuccess(res, data);
}

async function deleteClientContact(req, res) {
  const contactId = assertObjectId(req.params.contactId, 'contactId');
  const data = await clientContactService.deleteClientContact(contactId);
  return sendSuccess(res, data);
}

module.exports = {
  listClientContacts: asyncHandler(listClientContacts),
  createClientContact: asyncHandler(createClientContact),
  updateClientContact: asyncHandler(updateClientContact),
  updateClientContactStatus: asyncHandler(updateClientContactStatus),
  deleteClientContact: asyncHandler(deleteClientContact),
};
