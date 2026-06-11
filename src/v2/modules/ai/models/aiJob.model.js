const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { AI_JOB_STATUSES } = require('../constants/execution.constants');

const AiJobSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    sourceModule: { type: String, required: true, index: true },
    sourceId: { type: String, default: null, index: true },
    action: { type: String, required: true, index: true },
    mode: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(AI_JOB_STATUSES),
      default: AI_JOB_STATUSES.QUEUED,
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    inputSnapshot: { type: Schema.Types.Mixed, default: null },
    contextSnapshot: { type: Schema.Types.Mixed, default: null },
    result: { type: Schema.Types.Mixed, default: null },
    error: {
      message: { type: String, default: null },
      code: { type: String, default: null },
      details: { type: Schema.Types.Mixed, default: null },
    },
    retryCount: { type: Number, default: 0 },
    traceId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_ai_jobs', timestamps: true }
);

AiJobSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
AiJobSchema.index({ actorId: 1, createdAt: -1 });

async function ensureAiJobIndexes() {
  const Model = getV2Model('PtsAiJob', AiJobSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  AiJobSchema,
  ensureAiJobIndexes,
  getAiJobModel: () => getV2Model('PtsAiJob', AiJobSchema),
};
