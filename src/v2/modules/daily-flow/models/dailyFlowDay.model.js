const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  DAY_STATUSES,
  MOOD_ENERGY_MIN,
  MOOD_ENERGY_MAX,
  DEFAULT_TIMEZONE,
} = require('../constants/dailyFlow.constants');

const DailyFlowDaySchema = new Schema(
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
    timezone: {
      type: String,
      default: DEFAULT_TIMEZONE,
      trim: true,
    },
    status: {
      type: String,
      enum: DAY_STATUSES,
      default: 'draft',
      index: true,
    },
    moodMorning: {
      type: Number,
      min: MOOD_ENERGY_MIN,
      max: MOOD_ENERGY_MAX,
      default: null,
    },
    moodEvening: {
      type: Number,
      min: MOOD_ENERGY_MIN,
      max: MOOD_ENERGY_MAX,
      default: null,
    },
    energyMorning: {
      type: Number,
      min: MOOD_ENERGY_MIN,
      max: MOOD_ENERGY_MAX,
      default: null,
    },
    energyEvening: {
      type: Number,
      min: MOOD_ENERGY_MIN,
      max: MOOD_ENERGY_MAX,
      default: null,
    },
    moodMorningNote: { type: String, default: null, trim: true },
    moodEveningNote: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_daily_flow_days',
    timestamps: true,
  }
);

DailyFlowDaySchema.index(
  { accountId: 1, dayKey: 1 },
  {
    unique: true,
    name: 'pts_daily_flow_days_account_day_key_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

DailyFlowDaySchema.index({ accountId: 1, updatedAt: -1 });

async function ensureDailyFlowDayIndexes() {
  const Model = getV2Model('PtsDailyFlowDay', DailyFlowDaySchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DailyFlowDaySchema,
  ensureDailyFlowDayIndexes,
  getDailyFlowDayModel: () => getV2Model('PtsDailyFlowDay', DailyFlowDaySchema),
};
