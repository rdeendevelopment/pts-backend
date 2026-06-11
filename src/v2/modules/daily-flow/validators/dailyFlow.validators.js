const { body, param, query } = require('express-validator');
const {
  DAY_STATUSES,
  GOAL_TYPES,
  GOAL_STATUSES,
  GOAL_SOURCE_TYPES,
  GOAL_VISIBILITY,
  CATCHUP_TYPES,
  CATCHUP_STATUSES,
  CATCHUP_PRIORITIES,
  MOOD_PERIODS,
  MOOD_ENERGY_MIN,
  MOOD_ENERGY_MAX,
  MAX_LIST_LIMIT,
  MAX_DASHBOARD_LIMIT,
  DAY_KEY_PATTERN,
  QUICK_ADD_TYPES,
  FLOWMATE_EVENTS,
  FLOWMATE_ENTITY_TYPES,
} = require('../constants/dailyFlow.constants');

const dayKeyFieldRules = (location, field) => [
  location(field)
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .matches(DAY_KEY_PATTERN)
    .withMessage(`${field} must be YYYY-MM-DD`),
];

const optionalDayKeyQueryRules = [
  query('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  query('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  query('week_start').optional().matches(DAY_KEY_PATTERN).withMessage('week_start must be YYYY-MM-DD'),
  query('weekStart').optional().matches(DAY_KEY_PATTERN).withMessage('weekStart must be YYYY-MM-DD'),
  query('week_end').optional().matches(DAY_KEY_PATTERN).withMessage('week_end must be YYYY-MM-DD'),
  query('weekEnd').optional().matches(DAY_KEY_PATTERN).withMessage('weekEnd must be YYYY-MM-DD'),
];

const listLimitRules = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: MAX_LIST_LIMIT })
    .withMessage(`limit must be between 1 and ${MAX_LIST_LIMIT}`),
  query('skip').optional().isInt({ min: 0 }).withMessage('skip must be a non-negative integer'),
];

const dashboardQueryRules = [
  query('goals_limit')
    .optional()
    .isInt({ min: 1, max: MAX_DASHBOARD_LIMIT })
    .withMessage(`goals_limit must be between 1 and ${MAX_DASHBOARD_LIMIT}`),
  query('goalsLimit')
    .optional()
    .isInt({ min: 1, max: MAX_DASHBOARD_LIMIT })
    .withMessage(`goalsLimit must be between 1 and ${MAX_DASHBOARD_LIMIT}`),
  query('catchups_limit')
    .optional()
    .isInt({ min: 1, max: MAX_DASHBOARD_LIMIT })
    .withMessage(`catchups_limit must be between 1 and ${MAX_DASHBOARD_LIMIT}`),
  query('catchupsLimit')
    .optional()
    .isInt({ min: 1, max: MAX_DASHBOARD_LIMIT })
    .withMessage(`catchupsLimit must be between 1 and ${MAX_DASHBOARD_LIMIT}`),
];

const dateParamRules = dayKeyFieldRules(param, 'date');

const createGoalRules = [
  body('title').trim().notEmpty().withMessage('title is required'),
  body('goal_type').optional().isIn(GOAL_TYPES).withMessage(`goal_type must be one of: ${GOAL_TYPES.join(', ')}`),
  body('goalType').optional().isIn(GOAL_TYPES).withMessage(`goalType must be one of: ${GOAL_TYPES.join(', ')}`),
  body('type').optional().isIn(GOAL_TYPES).withMessage(`type must be one of: ${GOAL_TYPES.join(', ')}`),
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  body('due_date').optional().isString().withMessage('due_date must be a string'),
  body('dueDate').optional().isString().withMessage('dueDate must be a string'),
  body('description').optional({ nullable: true }).isString().withMessage('description must be a string'),
  body('category').optional({ nullable: true }).isString().withMessage('category must be a string'),
  body('target_value').optional().isFloat({ min: 0 }).withMessage('target_value must be >= 0'),
  body('targetValue').optional().isFloat({ min: 0 }).withMessage('targetValue must be >= 0'),
  body('current_value').optional().isFloat({ min: 0 }).withMessage('current_value must be >= 0'),
  body('currentValue').optional().isFloat({ min: 0 }).withMessage('currentValue must be >= 0'),
  body('unit').optional({ nullable: true }).isString().withMessage('unit must be a string'),
  body('visibility').optional().isIn(GOAL_VISIBILITY).withMessage(`visibility must be one of: ${GOAL_VISIBILITY.join(', ')}`),
  body('source_type').optional().isIn(GOAL_SOURCE_TYPES).withMessage(`source_type must be one of: ${GOAL_SOURCE_TYPES.join(', ')}`),
  body('sourceType').optional().isIn(GOAL_SOURCE_TYPES).withMessage(`sourceType must be one of: ${GOAL_SOURCE_TYPES.join(', ')}`),
  body('source_id').optional({ nullable: true }).isString().withMessage('source_id must be a string'),
  body('sourceId').optional({ nullable: true }).isString().withMessage('sourceId must be a string'),
  body().custom((_, { req }) => {
    const type = req.body.goal_type || req.body.goalType || req.body.type;
    const dayKey = req.body.day_key || req.body.dayKey;
    const dueDate = req.body.due_date || req.body.dueDate;
    if (!type) throw new Error('goal_type is required');
    if (!dayKey && !dueDate) throw new Error('day_key or due_date is required');
    return true;
  }),
];

const goalIdParamRules = [
  param('goalId').isString().notEmpty().withMessage('goal_id is required'),
];

const updateGoalRules = [
  ...goalIdParamRules,
  body('title').optional().trim().notEmpty().withMessage('title cannot be empty'),
  body('description').optional({ nullable: true }).isString().withMessage('description must be a string'),
  body('category').optional({ nullable: true }).isString().withMessage('category must be a string'),
  body('unit').optional({ nullable: true }).isString().withMessage('unit must be a string'),
  body('target_value').optional().isFloat({ min: 0 }).withMessage('target_value must be >= 0'),
  body('targetValue').optional().isFloat({ min: 0 }).withMessage('targetValue must be >= 0'),
  body('status').optional().isIn(GOAL_STATUSES.filter((s) => s !== 'deleted')).withMessage(`status must be one of: ${GOAL_STATUSES.filter((s) => s !== 'deleted').join(', ')}`),
  body('visibility').optional().isIn(GOAL_VISIBILITY).withMessage(`visibility must be one of: ${GOAL_VISIBILITY.join(', ')}`),
  body('sort_order').optional().isInt({ min: 0 }).withMessage('sort_order must be a non-negative integer'),
  body('sortOrder').optional().isInt({ min: 0 }).withMessage('sortOrder must be a non-negative integer'),
];

const updateGoalProgressRules = [
  ...goalIdParamRules,
  body('current_value').optional().isFloat({ min: 0 }).withMessage('current_value must be >= 0'),
  body('currentValue').optional().isFloat({ min: 0 }).withMessage('currentValue must be >= 0'),
  body().custom((_, { req }) => {
    const value = req.body.current_value ?? req.body.currentValue;
    if (value === undefined || value === null || value === '') {
      throw new Error('current_value is required');
    }
    return true;
  }),
];

const completeGoalRules = [...goalIdParamRules];

const reopenGoalRules = [...goalIdParamRules];

const deleteGoalRules = [...goalIdParamRules];

const requireDayKeyBodyRule = body().custom((_, { req }) => {
  const dayKey = req.body.day_key || req.body.dayKey;
  if (!dayKey) throw new Error('day_key is required');
  if (!DAY_KEY_PATTERN.test(String(dayKey).trim())) throw new Error('day_key must be YYYY-MM-DD');
  return true;
});

const createCatchupRules = [
  requireDayKeyBodyRule,
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  body('type').isIn(CATCHUP_TYPES).withMessage(`type must be one of: ${CATCHUP_TYPES.join(', ')}`),
  body('title').trim().notEmpty().withMessage('title is required'),
  body('description').optional({ nullable: true }).isString().withMessage('description must be a string'),
  body('priority').optional().isIn(CATCHUP_PRIORITIES).withMessage(`priority must be one of: ${CATCHUP_PRIORITIES.join(', ')}`),
  body('due_date').optional({ nullable: true }).isString().withMessage('due_date must be a string'),
  body('dueDate').optional({ nullable: true }).isString().withMessage('dueDate must be a string'),
  body('linked_project_id').optional({ nullable: true }).isString().withMessage('linked_project_id must be a string'),
  body('linkedProjectId').optional({ nullable: true }).isString().withMessage('linkedProjectId must be a string'),
  body('linked_task_id').optional({ nullable: true }).isString().withMessage('linked_task_id must be a string'),
  body('linkedTaskId').optional({ nullable: true }).isString().withMessage('linkedTaskId must be a string'),
];

const catchupIdParamRules = [
  param('catchupId').isString().notEmpty().withMessage('catchup_id is required'),
];

const updateCatchupRules = [
  ...catchupIdParamRules,
  body('title').optional().trim().notEmpty().withMessage('title cannot be empty'),
  body('description').optional({ nullable: true }).isString().withMessage('description must be a string'),
  body('status').optional().isIn(CATCHUP_STATUSES).withMessage(`status must be one of: ${CATCHUP_STATUSES.join(', ')}`),
  body('type').optional().isIn(CATCHUP_TYPES).withMessage(`type must be one of: ${CATCHUP_TYPES.join(', ')}`),
  body('priority').optional().isIn(CATCHUP_PRIORITIES).withMessage(`priority must be one of: ${CATCHUP_PRIORITIES.join(', ')}`),
];

const resolveCatchupRules = [...catchupIdParamRules];
const deleteCatchupRules = [...catchupIdParamRules];

const saveMoodRules = [
  requireDayKeyBodyRule,
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  body('period').isIn(MOOD_PERIODS).withMessage(`period must be one of: ${MOOD_PERIODS.join(', ')}`),
  body('mood').optional().isInt({ min: MOOD_ENERGY_MIN, max: MOOD_ENERGY_MAX }).withMessage(`mood must be between ${MOOD_ENERGY_MIN} and ${MOOD_ENERGY_MAX}`),
  body('energy').optional().isInt({ min: MOOD_ENERGY_MIN, max: MOOD_ENERGY_MAX }).withMessage(`energy must be between ${MOOD_ENERGY_MIN} and ${MOOD_ENERGY_MAX}`),
  body('note').optional({ nullable: true }).isString().withMessage('note must be a string'),
];

const saveReflectionRules = [
  requireDayKeyBodyRule,
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  body('biggest_win').optional({ nullable: true }).isString().withMessage('biggest_win must be a string'),
  body('biggestWin').optional({ nullable: true }).isString().withMessage('biggestWin must be a string'),
  body('blockers').optional({ nullable: true }).isString().withMessage('blockers must be a string'),
  body('learnings').optional({ nullable: true }).isString().withMessage('learnings must be a string'),
  body('tomorrow_plan').optional({ nullable: true }).isString().withMessage('tomorrow_plan must be a string'),
  body('tomorrowPlan').optional({ nullable: true }).isString().withMessage('tomorrowPlan must be a string'),
  body('mood').optional().isInt({ min: MOOD_ENERGY_MIN, max: MOOD_ENERGY_MAX }).withMessage(`mood must be between ${MOOD_ENERGY_MIN} and ${MOOD_ENERGY_MAX}`),
  body('energy').optional().isInt({ min: MOOD_ENERGY_MIN, max: MOOD_ENERGY_MAX }).withMessage(`energy must be between ${MOOD_ENERGY_MIN} and ${MOOD_ENERGY_MAX}`),
];

const weeklySummaryRules = [
  ...optionalDayKeyQueryRules,
];

const evaluateRewardsRules = [
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
];

const updateSettingsRules = [
  body('timezone').optional().isString().withMessage('timezone must be a string'),
  body('enable_daily_flow').optional().isBoolean().withMessage('enable_daily_flow must be a boolean'),
  body('enableDailyFlow').optional().isBoolean().withMessage('enableDailyFlow must be a boolean'),
  body('weekend_planning_enabled').optional().isBoolean().withMessage('weekend_planning_enabled must be a boolean'),
  body('weekendPlanningEnabled').optional().isBoolean().withMessage('weekendPlanningEnabled must be a boolean'),
  body('share_work_goals_with_admin').optional().isBoolean().withMessage('share_work_goals_with_admin must be a boolean'),
  body('shareWorkGoalsWithAdmin').optional().isBoolean().withMessage('shareWorkGoalsWithAdmin must be a boolean'),
  body('share_personal_goals_with_admin').optional().isBoolean().withMessage('share_personal_goals_with_admin must be a boolean'),
  body('sharePersonalGoalsWithAdmin').optional().isBoolean().withMessage('sharePersonalGoalsWithAdmin must be a boolean'),
  body('allow_reward_eligibility').optional().isBoolean().withMessage('allow_reward_eligibility must be a boolean'),
  body('allowRewardEligibility').optional().isBoolean().withMessage('allowRewardEligibility must be a boolean'),
  body('enable_ai_companion').optional().isBoolean().withMessage('enable_ai_companion must be a boolean'),
  body('enableAiCompanion').optional().isBoolean().withMessage('enableAiCompanion must be a boolean'),
  body('allow_ai_task_recommendations').optional().isBoolean().withMessage('allow_ai_task_recommendations must be a boolean'),
  body('allowAiTaskRecommendations').optional().isBoolean().withMessage('allowAiTaskRecommendations must be a boolean'),
  body('allow_ai_end_day_summary').optional().isBoolean().withMessage('allow_ai_end_day_summary must be a boolean'),
  body('allowAiEndDaySummary').optional().isBoolean().withMessage('allowAiEndDaySummary must be a boolean'),
];

const adminUserParamRules = [
  param('userId').isString().notEmpty().withMessage('user_id is required'),
];

const listGoalsRules = [
  ...optionalDayKeyQueryRules,
  query('type').optional().isIn(GOAL_TYPES).withMessage(`type must be one of: ${GOAL_TYPES.join(', ')}`),
  query('goal_type').optional().isIn(GOAL_TYPES).withMessage(`goal_type must be one of: ${GOAL_TYPES.join(', ')}`),
  query('status').optional().isIn(GOAL_STATUSES).withMessage(`status must be one of: ${GOAL_STATUSES.join(', ')}`),
  ...listLimitRules,
];

const listCatchupsRules = [
  ...optionalDayKeyQueryRules,
  query('type').optional().isIn(CATCHUP_TYPES).withMessage(`type must be one of: ${CATCHUP_TYPES.join(', ')}`),
  query('status').optional().isIn(CATCHUP_STATUSES).withMessage(`status must be one of: ${CATCHUP_STATUSES.join(', ')}`),
  ...listLimitRules,
];

const listRewardsRules = [
  ...optionalDayKeyQueryRules,
  ...listLimitRules,
];

const taskIdParamRules = [
  param('taskId').isMongoId().withMessage('task_id must be a valid ObjectId'),
];

const aiStateRules = [
  body('event').isIn(FLOWMATE_EVENTS).withMessage(`event must be one of: ${FLOWMATE_EVENTS.join(', ')}`),
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  body('entity_id').optional().isMongoId().withMessage('entity_id must be a valid ObjectId'),
  body('entityId').optional().isMongoId().withMessage('entityId must be a valid ObjectId'),
  body('entity_type').optional().isIn(FLOWMATE_ENTITY_TYPES).withMessage(`entity_type must be one of: ${FLOWMATE_ENTITY_TYPES.join(', ')}`),
  body('entityType').optional().isIn(FLOWMATE_ENTITY_TYPES).withMessage(`entityType must be one of: ${FLOWMATE_ENTITY_TYPES.join(', ')}`),
  body('task_sync').optional().isObject().withMessage('task_sync must be an object'),
  body('taskSync').optional().isObject().withMessage('taskSync must be an object'),
];

const aiWelcomeRules = [
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  body('force').optional().isBoolean().withMessage('force must be a boolean'),
];

const recommendTasksRules = [
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  body('limit').optional().isInt({ min: 1, max: 10 }).withMessage('limit must be between 1 and 10'),
];

const addTaskToTodayRules = [
  ...taskIdParamRules,
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
];

const quickAddRules = [
  body('text').trim().notEmpty().withMessage('text is required'),
  body('type').isIn(QUICK_ADD_TYPES).withMessage(`type must be one of: ${QUICK_ADD_TYPES.join(', ')}`),
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
];

const endDayRules = [
  body('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  body('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  body('blockers').optional({ nullable: true }).isString().withMessage('blockers must be a string'),
  body('tomorrow_plan').optional({ nullable: true }).isString().withMessage('tomorrow_plan must be a string'),
  body('tomorrowPlan').optional({ nullable: true }).isString().withMessage('tomorrowPlan must be a string'),
  body('notes').optional({ nullable: true }).isString().withMessage('notes must be a string'),
];

const adminDailyReportsQueryRules = [
  query('date').optional().matches(DAY_KEY_PATTERN).withMessage('date must be YYYY-MM-DD'),
  query('day_key').optional().matches(DAY_KEY_PATTERN).withMessage('day_key must be YYYY-MM-DD'),
  query('dayKey').optional().matches(DAY_KEY_PATTERN).withMessage('dayKey must be YYYY-MM-DD'),
  query('user_id').optional().isString().withMessage('user_id must be a string'),
  query('userId').optional().isString().withMessage('userId must be a string'),
  query('status').optional().isString().withMessage('status must be a string'),
  ...listLimitRules,
  query().custom((_, { req }) => {
    const date = req.query.date || req.query.day_key || req.query.dayKey;
    if (!date) throw new Error('date is required');
    return true;
  }),
];

const adminDailyReportDetailRules = [
  param('userId').isString().notEmpty().withMessage('user_id is required'),
  ...dayKeyFieldRules(param, 'date'),
];

module.exports = {
  dashboardQueryRules,
  dateParamRules,
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
};
