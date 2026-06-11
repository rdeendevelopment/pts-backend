const { getDiscussFlowDocumentVersionModel } = require('../models/discussFlowDocumentVersion.model');

async function create(payload) {
  const Model = getDiscussFlowDocumentVersionModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function listByDocument(documentId) {
  const Model = getDiscussFlowDocumentVersionModel();
  return Model.find({ documentId }).sort({ version: -1 }).lean();
}

module.exports = {
  create,
  listByDocument,
};
