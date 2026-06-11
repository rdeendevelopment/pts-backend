const { getDailyFlowSettingsModel } = require('../models/dailyFlowSettings.model');
const {
  DEFAULT_TIMEZONE,
  DEFAULT_ENABLE_DAILY_FLOW,
  DEFAULT_WEEKEND_PLANNING_ENABLED,
  DEFAULT_SHARE_WORK_GOALS_WITH_ADMIN,
  DEFAULT_SHARE_PERSONAL_GOALS_WITH_ADMIN,
  DEFAULT_PERSONAL_GOALS_PRIVATE,
  DEFAULT_ALLOW_REWARD_ELIGIBILITY,
} = require('../constants/dailyFlow.constants');

async function findSettingsByAccountId(accountId) {
  const Settings = getDailyFlowSettingsModel();
  return Settings.findOne({ accountId, isDeleted: false }).lean();
}

async function upsertSettings(accountId, updates = {}) {
  const Settings = getDailyFlowSettingsModel();
  return Settings.findOneAndUpdate(
    { accountId, isDeleted: false },
    {
      $set: updates,
      $setOnInsert: {
        accountId,
        timezone: DEFAULT_TIMEZONE,
        enableDailyFlow: DEFAULT_ENABLE_DAILY_FLOW,
        weekendPlanningEnabled: DEFAULT_WEEKEND_PLANNING_ENABLED,
        shareWorkGoalsWithAdmin: DEFAULT_SHARE_WORK_GOALS_WITH_ADMIN,
        sharePersonalGoalsWithAdmin: DEFAULT_SHARE_PERSONAL_GOALS_WITH_ADMIN,
        personalGoalsPrivate: DEFAULT_PERSONAL_GOALS_PRIVATE,
        allowRewardEligibility: DEFAULT_ALLOW_REWARD_ELIGIBILITY,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

module.exports = {
  findSettingsByAccountId,
  upsertSettings,
};
