const { info } = require('../../../kernel/logger');
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
const settingsRepository = require('../repositories/dailyFlowSettings.repository');
const { toSettingsDto } = require('../dto/dailyFlow.dto');
const { pickBoolean, pickString } = require('../helpers/payload.helper');
const { getBusinessTimezone } = require('../../activity/helpers/week.helper');

function buildDefaultSettings(accountId) {
  return toSettingsDto(null, {
    account_id: String(accountId),
    timezone: getBusinessTimezone() || DEFAULT_TIMEZONE,
    enable_daily_flow: DEFAULT_ENABLE_DAILY_FLOW,
    weekend_planning_enabled: DEFAULT_WEEKEND_PLANNING_ENABLED,
    share_work_goals_with_admin: DEFAULT_SHARE_WORK_GOALS_WITH_ADMIN,
    share_personal_goals_with_admin: DEFAULT_SHARE_PERSONAL_GOALS_WITH_ADMIN,
    personal_goals_private: DEFAULT_PERSONAL_GOALS_PRIVATE,
    allow_reward_eligibility: DEFAULT_ALLOW_REWARD_ELIGIBILITY,
    enable_ai_companion: DEFAULT_ENABLE_AI_COMPANION,
    allow_ai_task_recommendations: DEFAULT_ALLOW_AI_TASK_RECOMMENDATIONS,
    allow_ai_end_day_summary: DEFAULT_ALLOW_AI_END_DAY_SUMMARY,
  });
}

async function getSettingsRecord(accountId) {
  const settings = await settingsRepository.findSettingsByAccountId(accountId);
  if (!settings) {
    return buildDefaultSettings(accountId);
  }
  return toSettingsDto(settings);
}

async function getSettings(accountId) {
  info('Daily Flow getSettings called', { accountId });
  return getSettingsRecord(accountId);
}

async function updateSettings(accountId, payload = {}) {
  info('Daily Flow updateSettings called', { accountId });

  const updates = {};

  const timezone = pickString(payload, 'timezone');
  if (timezone) updates.timezone = timezone;

  const enableDailyFlow = pickBoolean(payload, 'enableDailyFlow', 'enable_daily_flow');
  if (enableDailyFlow !== undefined) updates.enableDailyFlow = enableDailyFlow;

  const shareWorkGoalsWithAdmin = pickBoolean(
    payload,
    'shareWorkGoalsWithAdmin',
    'share_work_goals_with_admin'
  );
  if (shareWorkGoalsWithAdmin !== undefined) {
    updates.shareWorkGoalsWithAdmin = shareWorkGoalsWithAdmin;
  }

  const sharePersonalGoalsWithAdmin = pickBoolean(
    payload,
    'sharePersonalGoalsWithAdmin',
    'share_personal_goals_with_admin'
  );
  if (sharePersonalGoalsWithAdmin !== undefined) {
    updates.sharePersonalGoalsWithAdmin = sharePersonalGoalsWithAdmin;
    if (sharePersonalGoalsWithAdmin) {
      updates.personalGoalsPrivate = false;
    } else {
      updates.personalGoalsPrivate = true;
    }
  }

  const allowRewardEligibility = pickBoolean(
    payload,
    'allowRewardEligibility',
    'allow_reward_eligibility'
  );
  if (allowRewardEligibility !== undefined) {
    updates.allowRewardEligibility = allowRewardEligibility;
  }

  const weekendPlanningEnabled = pickBoolean(
    payload,
    'weekendPlanningEnabled',
    'weekend_planning_enabled'
  );
  if (weekendPlanningEnabled !== undefined) {
    updates.weekendPlanningEnabled = weekendPlanningEnabled;
  }

  const enableAiCompanion = pickBoolean(payload, 'enableAiCompanion', 'enable_ai_companion');
  if (enableAiCompanion !== undefined) updates.enableAiCompanion = enableAiCompanion;

  const allowAiTaskRecommendations = pickBoolean(
    payload,
    'allowAiTaskRecommendations',
    'allow_ai_task_recommendations'
  );
  if (allowAiTaskRecommendations !== undefined) {
    updates.allowAiTaskRecommendations = allowAiTaskRecommendations;
  }

  const allowAiEndDaySummary = pickBoolean(
    payload,
    'allowAiEndDaySummary',
    'allow_ai_end_day_summary'
  );
  if (allowAiEndDaySummary !== undefined) {
    updates.allowAiEndDaySummary = allowAiEndDaySummary;
  }

  const settings = await settingsRepository.upsertSettings(accountId, updates);
  return toSettingsDto(settings);
}

module.exports = {
  buildDefaultSettings,
  getSettingsRecord,
  getSettings,
  updateSettings,
};
