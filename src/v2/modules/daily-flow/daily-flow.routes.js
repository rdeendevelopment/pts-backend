const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const requireSystemModule = require('../modules/middleware/requireSystemModule');
const requireDailyFlowUserEnabled = require('./middleware/requireDailyFlowUserEnabled');
const controller = require('./controllers/dailyFlow.controller');
const {
  dateParamRules,
  dashboardQueryRules,
  createGoalRules,
  updateGoalRules,
  updateGoalProgressRules,
  completeGoalRules,
  reopenGoalRules,
  deleteGoalRules,
  createCatchupRules,
  updateCatchupRules,
  resolveCatchupRules,
  deleteCatchupRules,
  saveMoodRules,
  saveReflectionRules,
  weeklySummaryRules,
  evaluateRewardsRules,
  updateSettingsRules,
  adminUserParamRules,
  listGoalsRules,
  listCatchupsRules,
  listRewardsRules,
  taskIdParamRules,
  aiStateRules,
  aiWelcomeRules,
  recommendTasksRules,
  addTaskToTodayRules,
  quickAddRules,
  endDayRules,
  adminDailyReportsQueryRules,
  adminDailyReportDetailRules,
} = require('./validators/dailyFlow.validators');

const router = Router();

const canView = authorize(['daily_flow.view', 'daily_flow.manage'], { mode: 'any' });
const canManage = authorize('daily_flow.manage');
const canAdmin = authorize('daily_flow.admin');

router.use(authenticate);

router.get('/status', canView, controller.getModuleStatus);

router.use(requireSystemModule('daily_flow'));

router.get('/settings', canView, controller.getSettings);
router.patch('/settings', canManage, updateSettingsRules, validateRequest, controller.updateSettings);

router.get('/admin/team-summary', canAdmin, controller.getAdminTeamSummary);
router.get('/admin/user/:userId', canAdmin, adminUserParamRules, validateRequest, controller.getAdminUserSummary);
router.get(
  '/admin/daily-reports',
  canAdmin,
  adminDailyReportsQueryRules,
  validateRequest,
  controller.getAdminDailyReports
);
router.get(
  '/admin/daily-reports/:userId/:date',
  canAdmin,
  adminDailyReportDetailRules,
  validateRequest,
  controller.getAdminDailyReportDetail
);

router.use(requireDailyFlowUserEnabled);

router.get('/today', canView, dashboardQueryRules, validateRequest, controller.getToday);
router.get('/day/:date', canView, dateParamRules, dashboardQueryRules, validateRequest, controller.getDayByDate);

router.post('/ai/state', canView, aiStateRules, validateRequest, controller.generateFlowMateState);
router.post('/ai/welcome', canView, aiWelcomeRules, validateRequest, controller.generateAiWelcome);
router.post(
  '/ai/recommend-tasks',
  canView,
  recommendTasksRules,
  validateRequest,
  controller.recommendTasks
);
router.post(
  '/tasks/:taskId/add-to-today',
  canManage,
  addTaskToTodayRules,
  validateRequest,
  controller.addTaskToToday
);
router.post('/quick-add', canManage, quickAddRules, validateRequest, controller.quickAdd);
router.post('/end-day', canManage, endDayRules, validateRequest, controller.endDay);

router.get('/goals', canView, listGoalsRules, validateRequest, controller.listGoals);
router.post('/goals', canManage, createGoalRules, validateRequest, controller.createGoal);
router.patch('/goals/:goalId', canManage, updateGoalRules, validateRequest, controller.updateGoal);
router.patch('/goals/:goalId/progress', canManage, updateGoalProgressRules, validateRequest, controller.updateGoalProgress);
router.patch('/goals/:goalId/complete', canManage, completeGoalRules, validateRequest, controller.completeGoal);
router.patch('/goals/:goalId/reopen', canManage, reopenGoalRules, validateRequest, controller.reopenGoal);
router.delete('/goals/:goalId', canManage, deleteGoalRules, validateRequest, controller.deleteGoal);

router.get('/catchups', canView, listCatchupsRules, validateRequest, controller.listCatchups);
router.post('/catchups', canManage, createCatchupRules, validateRequest, controller.createCatchup);
router.patch('/catchups/:catchupId', canManage, updateCatchupRules, validateRequest, controller.updateCatchup);
router.patch('/catchups/:catchupId/resolve', canManage, resolveCatchupRules, validateRequest, controller.resolveCatchup);
router.delete('/catchups/:catchupId', canManage, deleteCatchupRules, validateRequest, controller.deleteCatchup);

router.post('/mood', canManage, saveMoodRules, validateRequest, controller.saveMood);
router.post('/reflection', canManage, saveReflectionRules, validateRequest, controller.saveReflection);

router.get('/weekly-summary', canView, weeklySummaryRules, validateRequest, controller.getWeeklySummary);

router.get('/rewards', canView, listRewardsRules, validateRequest, controller.listRewards);
router.post('/rewards/evaluate', canManage, evaluateRewardsRules, validateRequest, controller.evaluateRewards);

module.exports = router;
