const { GOAL_TYPES } = require('../constants/dailyFlow.constants');
const { toGoalDto } = require('../dto/dailyFlow.dto');

function isPersonalGoal(goal = {}) {
  return goal.type === 'personal';
}

function isWorkGoal(goal = {}) {
  return goal.type === 'work';
}

function defaultGoalPrivacy(type) {
  if (!GOAL_TYPES.includes(type)) return true;
  return type === 'personal';
}

function canAdminViewPersonalGoalDetails(settings = {}) {
  return Boolean(
    settings.sharePersonalGoalsWithAdmin
    || settings.share_personal_goals_with_admin
  );
}

function canAdminViewWorkGoalDetails(settings = {}) {
  return Boolean(
    settings.shareWorkGoalsWithAdmin
    || settings.share_work_goals_with_admin
  );
}

function canAdminViewGoalDetails(goal = {}, settings = {}) {
  if (isPersonalGoal(goal)) {
    return canAdminViewPersonalGoalDetails(settings);
  }

  if (isWorkGoal(goal)) {
    return canAdminViewWorkGoalDetails(settings);
  }

  return false;
}

function maskGoalForAdmin(goal = {}, settings = {}) {
  if (canAdminViewGoalDetails(goal, settings)) {
    return toGoalDto(goal);
  }

  return {
    id: String(goal._id),
    type: goal.type,
    status: goal.status,
    day_key: goal.dayKey,
    details_hidden: true,
  };
}

function summarizeGoalsForAdmin(goals = [], settings = {}) {
  const workGoals = goals.filter(isWorkGoal);
  const personalGoals = goals.filter(isPersonalGoal);

  return {
    work_goals: canAdminViewWorkGoalDetails(settings)
      ? workGoals.map((goal) => toGoalDto(goal))
      : { count: workGoals.length, details_hidden: true },
    personal_goals: canAdminViewPersonalGoalDetails(settings)
      ? personalGoals.map((goal) => toGoalDto(goal))
      : { count: personalGoals.length, details_hidden: true },
  };
}

module.exports = {
  isPersonalGoal,
  isWorkGoal,
  defaultGoalPrivacy,
  canAdminViewPersonalGoalDetails,
  canAdminViewWorkGoalDetails,
  canAdminViewGoalDetails,
  maskGoalForAdmin,
  summarizeGoalsForAdmin,
};
