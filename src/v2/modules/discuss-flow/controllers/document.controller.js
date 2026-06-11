const { sendSuccess } = require('../../../kernel/responses');
const documentService = require('../services/document.service');
const documentGenerateService = require('../services/documentGenerate.service');

async function createDocument(req, res) {
  const data = await documentService.createDocument(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listDocuments(req, res) {
  const data = await documentService.listDocuments(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.query);
  return sendSuccess(res, data);
}

async function getDocument(req, res) {
  const data = await documentService.getDocument(req.v2Auth.accountId, req.v2Auth.accountId, req.params.documentId);
  return sendSuccess(res, data);
}

async function updateDocument(req, res) {
  const data = await documentService.updateDocument(req.v2Auth.accountId, req.v2Auth.accountId, req.params.documentId, req.body);
  return sendSuccess(res, data);
}

async function submitDocumentReview(req, res) {
  const data = await documentService.submitDocumentReview(req.v2Auth.accountId, req.v2Auth.accountId, req.params.documentId);
  return sendSuccess(res, data);
}

async function lockDocument(req, res) {
  const data = await documentService.lockDocument(req.v2Auth.accountId, req.v2Auth.accountId, req.params.documentId, req.body);
  return sendSuccess(res, data);
}

async function createDocumentNewVersion(req, res) {
  const data = await documentService.createDocumentNewVersion(req.v2Auth.accountId, req.v2Auth.accountId, req.params.documentId, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listDocumentVersions(req, res) {
  const data = await documentService.listDocumentVersions(req.v2Auth.accountId, req.v2Auth.accountId, req.params.documentId);
  return sendSuccess(res, data);
}

async function generateDocument(req, res) {
  const data = await documentGenerateService.generateDocument(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  const status = data.status === 'queued' ? 202 : 201;
  return sendSuccess(res, data, { status });
}

module.exports = {
  createDocument,
  listDocuments,
  getDocument,
  updateDocument,
  submitDocumentReview,
  lockDocument,
  createDocumentNewVersion,
  listDocumentVersions,
  generateDocument,
};
