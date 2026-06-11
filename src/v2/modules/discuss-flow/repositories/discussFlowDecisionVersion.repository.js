const { getDiscussFlowDecisionVersionModel } = require('../models/discussFlowDecisionVersion.model');

async function create(payload) {
  const Model = getDiscussFlowDecisionVersionModel();
  const doc = await Model.create(payload);
  return doc.toObject();
}

async function listByDecision(decisionId) {
  const Model = getDiscussFlowDecisionVersionModel();
  return Model.find({ decisionId }).sort({ version: -1 }).lean();
}

module.exports = {
  create,
  listByDecision,
};
