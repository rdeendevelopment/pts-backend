const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const AiUsageSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    model: { type: String, required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'PtsAiJob', default: null, index: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    costEstimate: { type: Number, default: 0 },
    executionMode: { type: String, default: 'sync' },
    latencyMs: { type: Number, default: 0 },
    traceId: { type: String, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_ai_usage', timestamps: true }
);

AiUsageSchema.index({ tenantId: 1, createdAt: -1 });
AiUsageSchema.index({ userId: 1, createdAt: -1 });
AiUsageSchema.index({ module: 1, action: 1, createdAt: -1 });

async function ensureAiUsageIndexes() {
  const Model = getV2Model('PtsAiUsage', AiUsageSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  AiUsageSchema,
  ensureAiUsageIndexes,
  getAiUsageModel: () => getV2Model('PtsAiUsage', AiUsageSchema),
};
