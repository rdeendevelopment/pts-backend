const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { IMPORT_SOURCE_TYPES, IMPORT_BATCH_STATUS } = require('../constants/discussFlow.constants');

const DiscussFlowImportBatchSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowWorkspace', required: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    actorType: { type: String, default: 'user' },
    sourceType: { type: String, enum: IMPORT_SOURCE_TYPES, required: true },
    rawTextPreview: { type: String, default: null },
    rawTextHash: { type: String, required: true, index: true },
    messageCount: { type: Number, default: 0, min: 0 },
    participantCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: IMPORT_BATCH_STATUS, default: 'created', index: true },
    aiJobId: { type: Schema.Types.ObjectId, ref: 'PtsAiJob', default: null, index: true },
    summaryId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowAiReviewItem', default: null },
    stats: { type: Schema.Types.Mixed, default: {} },
    error: { type: Schema.Types.Mixed, default: null },
    completedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_discuss_flow_import_batches', timestamps: true }
);

DiscussFlowImportBatchSchema.index({ tenantId: 1, topicId: 1, status: 1, createdAt: -1 });

async function ensureDiscussFlowImportBatchIndexes() {
  const Model = getV2Model('PtsDiscussFlowImportBatch', DiscussFlowImportBatchSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowImportBatchSchema,
  ensureDiscussFlowImportBatchIndexes,
  getDiscussFlowImportBatchModel: () => getV2Model('PtsDiscussFlowImportBatch', DiscussFlowImportBatchSchema),
};
