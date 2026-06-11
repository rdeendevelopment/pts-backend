const { ensureDailyFlowDayIndexes } = require('./dailyFlowDay.model');
const { ensureDailyFlowGoalIndexes } = require('./dailyFlowGoal.model');
const { ensureDailyFlowCatchupIndexes } = require('./dailyFlowCatchup.model');
const { ensureDailyFlowReflectionIndexes } = require('./dailyFlowReflection.model');
const { ensureDailyFlowRewardIndexes } = require('./dailyFlowReward.model');
const { ensureDailyFlowSettingsIndexes } = require('./dailyFlowSettings.model');
const { ensureDailyFlowAiMemoryIndexes } = require('./dailyFlowAiMemory.model');
const { ensureDailyFlowEndDayReportIndexes } = require('./dailyFlowEndDayReport.model');

async function ensureDailyFlowModuleIndexes() {
  await ensureDailyFlowDayIndexes();
  await ensureDailyFlowGoalIndexes();
  await ensureDailyFlowCatchupIndexes();
  await ensureDailyFlowReflectionIndexes();
  await ensureDailyFlowRewardIndexes();
  await ensureDailyFlowSettingsIndexes();
  await ensureDailyFlowAiMemoryIndexes();
  await ensureDailyFlowEndDayReportIndexes();
}

module.exports = {
  ensureDailyFlowDayIndexes,
  ensureDailyFlowGoalIndexes,
  ensureDailyFlowCatchupIndexes,
  ensureDailyFlowReflectionIndexes,
  ensureDailyFlowRewardIndexes,
  ensureDailyFlowSettingsIndexes,
  ensureDailyFlowAiMemoryIndexes,
  ensureDailyFlowEndDayReportIndexes,
  ensureDailyFlowModuleIndexes,
};
