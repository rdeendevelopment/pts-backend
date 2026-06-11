const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { AI_REVIEW_ITEM_TYPES, AI_REVIEW_ITEM_STATUS, TOPIC_PRIORITY } = require('../constants/discussFlow.constants');

const DiscussFlowAiReviewItemSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowWorkspace', required: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    importBatchId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowImportBatch', default: null, index: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowMessage', default: null, index: true },
    type: { type: String, enum: AI_REVIEW_ITEM_TYPES, required: true, index: true },
    title: { type: String, default: null },
    content: { type: String, default: null },
    reasoning: { type: String, default: null },
    confidence: { type: Number, default: null, min: 0, max: 1 },
    status: { type: String, enum: AI_REVIEW_ITEM_STATUS, default: 'pending', index: true },
    suggestedPriority: { type: String, enum: TOPIC_PRIORITY, default: 'medium' },
    suggestedOwnerId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    linkedMessageIds: { type: [Schema.Types.ObjectId], default: [] },
    approvedEntityId: { type: Schema.Types.ObjectId, default: null },
    createdByAiJobId: { type: Schema.Types.ObjectId, ref: 'PtsAiJob', default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    reviewedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_discuss_flow_ai_review_items', timestamps: true }
);

DiscussFlowAiReviewItemSchema.index({ topicId: 1, status: 1, type: 1, createdAt: -1 });
DiscussFlowAiReviewItemSchema.index({ messageId: 1, status: 1 });
DiscussFlowAiReviewItemSchema.index({ createdByAiJobId: 1, topicId: 1 });

async function ensureDiscussFlowAiReviewItemIndexes() {
  const Model = getV2Model('PtsDiscussFlowAiReviewItem', DiscussFlowAiReviewItemSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowAiReviewItemSchema,
  ensureDiscussFlowAiReviewItemIndexes,
  getDiscussFlowAiReviewItemModel: () => getV2Model('PtsDiscussFlowAiReviewItem', DiscussFlowAiReviewItemSchema),
};
