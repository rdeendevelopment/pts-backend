const { getDiscussFlowRequirementVersionModel } = require('../models/discussFlowRequirementVersion.model');

async function create(payload) {
  const Model = getDiscussFlowRequirementVersionModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function listByRequirement(requirementId) {
  const Model = getDiscussFlowRequirementVersionModel();
  return Model.find({ requirementId }).sort({ version: -1 }).lean();
}

module.exports = {
  create,
  listByRequirement,
};
