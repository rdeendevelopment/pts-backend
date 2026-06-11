const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { AI_MEMORY_TYPES } = require('../constants/dailyFlow.constants');

const DailyFlowAiMemorySchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      default: null,
      index: true,
    },
    dayKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: AI_MEMORY_TYPES,
      required: true,
      index: true,
    },
    inputSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },
    outputText: {
      type: String,
      default: null,
      trim: true,
    },
    event: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    structuredOutput: {
      type: Schema.Types.Mixed,
      default: null,
    },
    cacheKey: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    provider: {
      type: String,
      default: 'openai',
      trim: true,
    },
    model: {
      type: String,
      default: null,
      trim: true,
    },
    tokens: {
      type: Number,
      default: 0,
      min: 0,
    },
    fallbackUsed: {
      type: Boolean,
      default: false,
    },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_daily_flow_ai_memory',
    timestamps: true,
  }
);

DailyFlowAiMemorySchema.index({ accountId: 1, dayKey: 1, type: 1, createdAt: -1 });

async function ensureDailyFlowAiMemoryIndexes() {
  const Model = getV2Model('PtsDailyFlowAiMemory', DailyFlowAiMemorySchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DailyFlowAiMemorySchema,
  ensureDailyFlowAiMemoryIndexes,
  getDailyFlowAiMemoryModel: () => getV2Model('PtsDailyFlowAiMemory', DailyFlowAiMemorySchema),
};
