const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  DEFAULT_TIMEZONE,
  DEFAULT_ENABLE_DAILY_FLOW,
  DEFAULT_WEEKEND_PLANNING_ENABLED,
  DEFAULT_SHARE_WORK_GOALS_WITH_ADMIN,
  DEFAULT_SHARE_PERSONAL_GOALS_WITH_ADMIN,
  DEFAULT_PERSONAL_GOALS_PRIVATE,
  DEFAULT_ALLOW_REWARD_ELIGIBILITY,
  DEFAULT_ENABLE_AI_COMPANION,
  DEFAULT_ALLOW_AI_TASK_RECOMMENDATIONS,
  DEFAULT_ALLOW_AI_END_DAY_SUMMARY,
} = require('../constants/dailyFlow.constants');

const DailyFlowSettingsSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      required: true,
      index: true,
    },
    timezone: {
      type: String,
      default: DEFAULT_TIMEZONE,
      trim: true,
    },
    enableDailyFlow: {
      type: Boolean,
      default: DEFAULT_ENABLE_DAILY_FLOW,
    },
    weekendPlanningEnabled: {
      type: Boolean,
      default: DEFAULT_WEEKEND_PLANNING_ENABLED,
    },
    shareWorkGoalsWithAdmin: {
      type: Boolean,
      default: DEFAULT_SHARE_WORK_GOALS_WITH_ADMIN,
    },
    sharePersonalGoalsWithAdmin: {
      type: Boolean,
      default: DEFAULT_SHARE_PERSONAL_GOALS_WITH_ADMIN,
    },
    personalGoalsPrivate: {
      type: Boolean,
      default: DEFAULT_PERSONAL_GOALS_PRIVATE,
    },
    allowRewardEligibility: {
      type: Boolean,
      default: DEFAULT_ALLOW_REWARD_ELIGIBILITY,
    },
    enableAiCompanion: {
      type: Boolean,
      default: DEFAULT_ENABLE_AI_COMPANION,
    },
    allowAiTaskRecommendations: {
      type: Boolean,
      default: DEFAULT_ALLOW_AI_TASK_RECOMMENDATIONS,
    },
    allowAiEndDaySummary: {
      type: Boolean,
      default: DEFAULT_ALLOW_AI_END_DAY_SUMMARY,
    },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_daily_flow_settings',
    timestamps: true,
  }
);

DailyFlowSettingsSchema.index(
  { accountId: 1 },
  {
    unique: true,
    name: 'pts_daily_flow_settings_account_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensureDailyFlowSettingsIndexes() {
  const Model = getV2Model('PtsDailyFlowSettings', DailyFlowSettingsSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DailyFlowSettingsSchema,
  ensureDailyFlowSettingsIndexes,
  getDailyFlowSettingsModel: () => getV2Model('PtsDailyFlowSettings', DailyFlowSettingsSchema),
};
