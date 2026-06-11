const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  REWARD_TYPES,
  REWARD_RULES,
  REWARD_STATUSES,
} = require('../constants/dailyFlow.constants');

const DailyFlowRewardSchema = new Schema(
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
    type: {
      type: String,
      enum: REWARD_TYPES,
      required: true,
      index: true,
    },
    ruleKey: {
      type: String,
      enum: REWARD_RULES,
      required: true,
      index: true,
    },
    label: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: REWARD_STATUSES,
      default: 'earned',
      index: true,
    },
    earnedAt: { type: Date, default: Date.now, index: true },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_daily_flow_rewards',
    timestamps: true,
  }
);

DailyFlowRewardSchema.index({ accountId: 1, dayKey: 1, earnedAt: -1 });
DailyFlowRewardSchema.index({ accountId: 1, type: 1, status: 1 });
DailyFlowRewardSchema.index(
  { accountId: 1, dayKey: 1, ruleKey: 1 },
  {
    unique: true,
    name: 'pts_daily_flow_rewards_account_day_rule_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensureDailyFlowRewardIndexes() {
  const Model = getV2Model('PtsDailyFlowReward', DailyFlowRewardSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DailyFlowRewardSchema,
  ensureDailyFlowRewardIndexes,
  getDailyFlowRewardModel: () => getV2Model('PtsDailyFlowReward', DailyFlowRewardSchema),
};
