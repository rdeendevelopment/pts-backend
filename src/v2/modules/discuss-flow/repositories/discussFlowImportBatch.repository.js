const { getDiscussFlowImportBatchModel } = require('../models/discussFlowImportBatch.model');

async function create(payload) {
  const Model = getDiscussFlowImportBatchModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function findById(id, tenantId) {
  const Model = getDiscussFlowImportBatchModel();
  return Model.findOne({ _id: id, tenantId }).lean();
}

async function updateById(id, tenantId, updates) {
  const Model = getDiscussFlowImportBatchModel();
  return Model.findOneAndUpdate({ _id: id, tenantId }, { $set: updates }, { new: true }).lean();
}

async function findByAiJobId(aiJobId) {
  const Model = getDiscussFlowImportBatchModel();
  return Model.findOne({ aiJobId }).lean();
}

module.exports = {
  create,
  findById,
  updateById,
  findByAiJobId,
};
