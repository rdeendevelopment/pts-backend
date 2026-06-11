const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const AiLogSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'PtsAiJob', default: null, index: true },
    action: { type: String, required: true, index: true },
    sourceModule: { type: String, default: null },
    sourceId: { type: String, default: null },
    model: { type: String, default: null },
    executionMode: { type: String, default: null },
    status: { type: String, default: 'success', index: true },
    promptSnapshot: { type: String, default: null },
    responseSnapshot: { type: String, default: null },
    errorMessage: { type: String, default: null },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    traceId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_ai_logs', timestamps: true }
);

AiLogSchema.index({ tenantId: 1, createdAt: -1 });
AiLogSchema.index({ action: 1, createdAt: -1 });

async function ensureAiLogIndexes() {
  const Model = getV2Model('PtsAiLog', AiLogSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  AiLogSchema,
  ensureAiLogIndexes,
  getAiLogModel: () => getV2Model('PtsAiLog', AiLogSchema),
};
