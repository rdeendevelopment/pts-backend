const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { DECISION_STATUS } = require('../constants/discussFlow.constants');

const DiscussFlowDecisionVersionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    decisionId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowDecision', required: true, index: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true },
    context: { type: String, default: null },
    impact: { type: String, default: null },
    status: { type: String, enum: DECISION_STATUS, required: true },
    changeReason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_discuss_flow_decision_versions', timestamps: { createdAt: true, updatedAt: false } }
);

DiscussFlowDecisionVersionSchema.index({ decisionId: 1, version: 1 }, { unique: true });

async function ensureDiscussFlowDecisionVersionIndexes() {
  const Model = getV2Model('PtsDiscussFlowDecisionVersion', DiscussFlowDecisionVersionSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowDecisionVersionSchema,
  ensureDiscussFlowDecisionVersionIndexes,
  getDiscussFlowDecisionVersionModel: () => getV2Model('PtsDiscussFlowDecisionVersion', DiscussFlowDecisionVersionSchema),
};
