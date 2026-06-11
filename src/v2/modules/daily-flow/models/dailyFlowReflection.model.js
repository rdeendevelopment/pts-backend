const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  MOOD_ENERGY_MIN,
  MOOD_ENERGY_MAX,
} = require('../constants/dailyFlow.constants');

const DailyFlowReflectionSchema = new Schema(
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
    dayId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsDailyFlowDay',
      default: null,
      index: true,
    },
    dayKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    biggestWin: { type: String, default: null, trim: true },
    blockers: { type: String, default: null, trim: true },
    learnings: { type: String, default: null, trim: true },
    tomorrowPlan: { type: String, default: null, trim: true },
    mood: {
      type: Number,
      min: MOOD_ENERGY_MIN,
      max: MOOD_ENERGY_MAX,
      default: null,
    },
    energy: {
      type: Number,
      min: MOOD_ENERGY_MIN,
      max: MOOD_ENERGY_MAX,
      default: null,
    },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_daily_flow_reflections',
    timestamps: true,
  }
);

DailyFlowReflectionSchema.index(
  { accountId: 1, dayKey: 1 },
  {
    unique: true,
    name: 'pts_daily_flow_reflections_account_day_key_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensureDailyFlowReflectionIndexes() {
  const Model = getV2Model('PtsDailyFlowReflection', DailyFlowReflectionSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DailyFlowReflectionSchema,
  ensureDailyFlowReflectionIndexes,
  getDailyFlowReflectionModel: () => getV2Model('PtsDailyFlowReflection', DailyFlowReflectionSchema),
};
