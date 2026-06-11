const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { REQUIREMENT_STATUS, TOPIC_PRIORITY } = require('../constants/discussFlow.constants');

const DiscussFlowRequirementSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    status: { type: String, enum: REQUIREMENT_STATUS, default: 'draft', index: true },
    priority: { type: String, enum: TOPIC_PRIORITY, default: 'medium' },
    version: { type: Number, default: 1, min: 1 },
    parentRequirementId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowRequirement', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    approvedAt: { type: Date, default: null },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    lockedAt: { type: Date, default: null },
    lockedVersion: { type: Number, default: null },
    changeReason: { type: String, default: null },
    sourceReviewItemId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowAiReviewItem', default: null },
    sourceMessageIds: { type: [Schema.Types.ObjectId], default: [] },
    sourceAiJobId: { type: Schema.Types.ObjectId, ref: 'PtsAiJob', default: null },
    linkedDecisionIds: { type: [Schema.Types.ObjectId], default: [] },
    linkedTaskIds: { type: [Schema.Types.ObjectId], default: [] },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_discuss_flow_requirements', timestamps: true }
);

DiscussFlowRequirementSchema.index({ topicId: 1, status: 1, createdAt: -1 });
DiscussFlowRequirementSchema.index({ title: 'text', description: 'text' }, { name: 'pts_df_requirements_text' });

async function ensureDiscussFlowRequirementIndexes() {
  const Model = getV2Model('PtsDiscussFlowRequirement', DiscussFlowRequirementSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowRequirementSchema,
  ensureDiscussFlowRequirementIndexes,
  getDiscussFlowRequirementModel: () => getV2Model('PtsDiscussFlowRequirement', DiscussFlowRequirementSchema),
};
