function buildProgressSummary({ workGoals = [], personalGoals = [] } = {}) {
  const allGoals = [...workGoals, ...personalGoals];
  const totalGoals = allGoals.length;
  const completedGoals = allGoals.filter((goal) => goal.status === 'completed').length;
  const workGoalsCompleted = workGoals.filter((goal) => goal.status === 'completed').length;
  const personalGoalsCompleted = personalGoals.filter((goal) => goal.status === 'completed').length;

  return {
    total_goals: totalGoals,
    completed_goals: completedGoals,
    work_goals_completed: workGoalsCompleted,
    personal_goals_completed: personalGoalsCompleted,
    completion_percentage: totalGoals > 0
      ? Math.round((completedGoals / totalGoals) * 100)
      : 0,
  };
}

module.exports = {
  buildProgressSummary,
};
