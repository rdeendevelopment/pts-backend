const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const statusService = require('../services/dailyFlowStatus.service');
const dashboardService = require('../services/dailyFlowDashboard.service');
const goalService = require('../services/dailyFlowGoal.service');
const catchupService = require('../services/dailyFlowCatchup.service');
const dayService = require('../services/dailyFlowDay.service');
const reflectionService = require('../services/dailyFlowReflection.service');
const weeklyService = require('../services/dailyFlowWeekly.service');
const rewardService = require('../services/dailyFlowReward.service');
const settingsService = require('../services/dailyFlowSettings.service');
const adminService = require('../services/dailyFlowAdmin.service');
const adminReportsService = require('../services/dailyFlowAdminReports.service');
const welcomeService = require('../services/dailyFlowWelcome.service');
const taskRecommendationService = require('../services/dailyFlowTaskRecommendation.service');
const addToTodayService = require('../services/dailyFlowAddToToday.service');
const quickAddService = require('../services/dailyFlowQuickAdd.service');
const endDayService = require('../services/dailyFlowEndDay.service');
const flowMateStateService = require('../services/dailyFlowFlowMateState.service');
const { AppError } = require('../../../kernel/errors');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');

async function getModuleStatus(req, res) {
  const data = await statusService.getModuleStatus(req.v2Auth.accountId);
  return sendSuccess(res, data);
}

async function getToday(req, res) {
  const data = await dashboardService.buildDashboard(req.v2Auth.accountId, null, req.query);
  return sendSuccess(res, data);
}

async function getDayByDate(req, res) {
  const data = await dashboardService.buildDashboard(
    req.v2Auth.accountId,
    req.params.date,
    req.query
  );
  return sendSuccess(res, data);
}

async function listGoals(req, res) {
  const data = await goalService.listGoals(req.v2Auth.accountId, req.query);
  return sendSuccess(res, data);
}

async function createGoal(req, res) {
  const data = await goalService.createGoal(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function updateGoal(req, res) {
  const data = await goalService.updateGoal(req.v2Auth.accountId, req.params.goalId, req.body);
  return sendSuccess(res, data);
}

async function updateGoalProgress(req, res) {
  const data = await goalService.updateGoalProgress(
    req.v2Auth.accountId,
    req.params.goalId,
    req.body
  );
  return sendSuccess(res, data);
}

async function completeGoal(req, res) {
  const data = await goalService.completeGoal(req.v2Auth.accountId, req.params.goalId);
  return sendSuccess(res, data);
}

async function reopenGoal(req, res) {
  const data = await goalService.reopenGoal(req.v2Auth.accountId, req.params.goalId);
  return sendSuccess(res, data);
}

async function deleteGoal(req, res) {
  const data = await goalService.deleteGoal(req.v2Auth.accountId, req.params.goalId);
  return sendSuccess(res, data);
}

async function listCatchups(req, res) {
  const data = await catchupService.listCatchups(req.v2Auth.accountId, req.query);
  return sendSuccess(res, data);
}

async function createCatchup(req, res) {
  const data = await catchupService.createCatchup(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function updateCatchup(req, res) {
  const data = await catchupService.updateCatchup(
    req.v2Auth.accountId,
    req.params.catchupId,
    req.body
  );
  return sendSuccess(res, data);
}

async function resolveCatchup(req, res) {
  const data = await catchupService.resolveCatchup(req.v2Auth.accountId, req.params.catchupId);
  return sendSuccess(res, data);
}

async function deleteCatchup(req, res) {
  const data = await catchupService.deleteCatchup(req.v2Auth.accountId, req.params.catchupId);
  return sendSuccess(res, data);
}

async function saveMood(req, res) {
  const data = await dayService.saveMood(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data);
}

async function saveReflection(req, res) {
  const data = await reflectionService.saveReflection(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data);
}

async function getWeeklySummary(req, res) {
  const data = await weeklyService.getWeeklySummary(req.v2Auth.accountId, req.query);
  return sendSuccess(res, data);
}

async function listRewards(req, res) {
  const data = await rewardService.listRewards(req.v2Auth.accountId, req.query);
  return sendSuccess(res, data);
}

async function evaluateRewards(req, res) {
  const data = await rewardService.evaluateRewards(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data);
}

async function getSettings(req, res) {
  const data = await settingsService.getSettings(req.v2Auth.accountId);
  return sendSuccess(res, data);
}

async function updateSettings(req, res) {
  const data = await settingsService.updateSettings(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data);
}

async function getAdminTeamSummary(req, res) {
  const data = await adminService.getTeamSummary(req.query);
  return sendSuccess(res, data);
}

async function getAdminUserSummary(req, res) {
  const data = await adminService.getUserSummary(req.params.userId, req.query);
  return sendSuccess(res, data);
}

async function getAdminDailyReports(req, res) {
  const data = await adminReportsService.listDailyReports(req.query);
  return sendSuccess(res, data);
}

async function getAdminDailyReportDetail(req, res) {
  const data = await adminReportsService.getDailyReportDetail(req.params.userId, req.params.date);
  if (!data) {
    throw new AppError('Daily report not found', {
      status: 404,
      code: dailyFlowErrorCodes.DAILY_FLOW_DAY_NOT_FOUND,
    });
  }
  return sendSuccess(res, data);
}

async function generateFlowMateState(req, res) {
  const data = await flowMateStateService.generateFlowMateState(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data);
}

async function generateAiWelcome(req, res) {
  const dayKey = req.body?.day_key || req.body?.dayKey || null;
  const force = Boolean(req.body?.force);
  const data = await welcomeService.generateWelcome(req.v2Auth.accountId, dayKey, { force });
  return sendSuccess(res, data);
}

async function recommendTasks(req, res) {
  const settingsService = require('../services/dailyFlowSettings.service');
  const dayService = require('../services/dailyFlowDay.service');
  const { resolveUserIdForAccount } = require('../helpers/account.helper');

  const accountId = req.v2Auth.accountId;
  const dayKey = req.body?.day_key || req.body?.dayKey || await dayService.getTodayDayKey(accountId);
  const settings = await settingsService.getSettingsRecord(accountId);
  const userId = await resolveUserIdForAccount(accountId);

  const data = await taskRecommendationService.recommendTasks({
    accountId,
    userId,
    dayKey,
    timezone: settings.timezone || 'UTC',
    settings,
    limit: Number(req.body?.limit) || 5,
  });
  return sendSuccess(res, data);
}

async function addTaskToToday(req, res) {
  const dayKey = req.body?.day_key || req.body?.dayKey || null;
  const data = await addToTodayService.addTaskToToday(
    req.v2Auth.accountId,
    req.params.taskId,
    dayKey
  );
  return sendSuccess(res, data, { status: 201 });
}

async function quickAdd(req, res) {
  const data = await quickAddService.quickAdd(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function endDay(req, res) {
  const data = await endDayService.endDay(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data);
}

module.exports = {
  getModuleStatus: asyncHandler(getModuleStatus),
  getToday: asyncHandler(getToday),
  getDayByDate: asyncHandler(getDayByDate),
  listGoals: asyncHandler(listGoals),
  createGoal: asyncHandler(createGoal),
  updateGoal: asyncHandler(updateGoal),
  updateGoalProgress: asyncHandler(updateGoalProgress),
  completeGoal: asyncHandler(completeGoal),
  reopenGoal: asyncHandler(reopenGoal),
  deleteGoal: asyncHandler(deleteGoal),
  listCatchups: asyncHandler(listCatchups),
  createCatchup: asyncHandler(createCatchup),
  updateCatchup: asyncHandler(updateCatchup),
  resolveCatchup: asyncHandler(resolveCatchup),
  deleteCatchup: asyncHandler(deleteCatchup),
  saveMood: asyncHandler(saveMood),
  saveReflection: asyncHandler(saveReflection),
  getWeeklySummary: asyncHandler(getWeeklySummary),
  listRewards: asyncHandler(listRewards),
  evaluateRewards: asyncHandler(evaluateRewards),
  getSettings: asyncHandler(getSettings),
  updateSettings: asyncHandler(updateSettings),
  getAdminTeamSummary: asyncHandler(getAdminTeamSummary),
  getAdminUserSummary: asyncHandler(getAdminUserSummary),
  getAdminDailyReports: asyncHandler(getAdminDailyReports),
  getAdminDailyReportDetail: asyncHandler(getAdminDailyReportDetail),
  generateFlowMateState: asyncHandler(generateFlowMateState),
  generateAiWelcome: asyncHandler(generateAiWelcome),
  recommendTasks: asyncHandler(recommendTasks),
  addTaskToToday: asyncHandler(addTaskToToday),
  quickAdd: asyncHandler(quickAdd),
  endDay: asyncHandler(endDay),
};
