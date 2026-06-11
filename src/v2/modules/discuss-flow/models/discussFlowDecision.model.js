const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { DECISION_STATUS } = require('../constants/discussFlow.constants');

const DiscussFlowDecisionSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    title: { type: String, required: true, trim: true },
    context: { type: String, default: null },
    impact: { type: String, default: null },
    status: { type: String, enum: DECISION_STATUS, default: 'draft', index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    parentDecisionId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowDecision', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    approvedAt: { type: Date, default: null },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    lockedAt: { type: Date, default: null },
    changeReason: { type: String, default: null },
    sourceReviewItemId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowAiReviewItem', default: null },
    sourceMessageIds: { type: [Schema.Types.ObjectId], default: [] },
    sourceAiJobId: { type: Schema.Types.ObjectId, ref: 'PtsAiJob', default: null },
    linkedRequirements: { type: [Schema.Types.ObjectId], default: [] },
    version: { type: Number, default: 1, min: 1 },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_discuss_flow_decisions', timestamps: true }
);

DiscussFlowDecisionSchema.index({ topicId: 1, status: 1, createdAt: -1 });
DiscussFlowDecisionSchema.index({ title: 'text', context: 'text', impact: 'text' }, { name: 'pts_df_decisions_text' });

async function ensureDiscussFlowDecisionIndexes() {
  const Model = getV2Model('PtsDiscussFlowDecision', DiscussFlowDecisionSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowDecisionSchema,
  ensureDiscussFlowDecisionIndexes,
  getDiscussFlowDecisionModel: () => getV2Model('PtsDiscussFlowDecision', DiscussFlowDecisionSchema),
};
