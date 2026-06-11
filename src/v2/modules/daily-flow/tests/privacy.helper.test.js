const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canAdminViewGoalDetails,
  summarizeGoalsForAdmin,
} = require('../helpers/privacy.helper');

const personalGoal = {
  _id: '665f1c2d3e4f5a6b7c8d9e01',
  type: 'personal',
  title: 'Private evening walk',
  dayKey: '2026-06-06',
  status: 'pending',
};

const workGoal = {
  _id: '665f1c2d3e4f5a6b7c8d9e02',
  type: 'work',
  title: 'Ship API layer',
  dayKey: '2026-06-06',
  status: 'in_progress',
};

test('personal goal details are hidden from admin by default', () => {
  assert.equal(canAdminViewGoalDetails(personalGoal, {}), false);

  const summary = summarizeGoalsForAdmin([personalGoal, workGoal], {});
  assert.equal(summary.personal_goals.count, 1);
  assert.equal(summary.personal_goals.details_hidden, true);
  assert.equal(summary.work_goals.count, 1);
  assert.equal(summary.work_goals.details_hidden, true);
});

test('work goals are visible only when shareWorkGoalsWithAdmin is true', () => {
  assert.equal(canAdminViewGoalDetails(workGoal, { share_work_goals_with_admin: false }), false);
  assert.equal(canAdminViewGoalDetails(workGoal, { share_work_goals_with_admin: true }), true);

  const summary = summarizeGoalsForAdmin([workGoal], { share_work_goals_with_admin: true });
  assert.equal(Array.isArray(summary.work_goals), true);
  assert.equal(summary.work_goals[0].title, 'Ship API layer');
});

test('personal goals are visible only when sharePersonalGoalsWithAdmin is true', () => {
  assert.equal(canAdminViewGoalDetails(personalGoal, { share_personal_goals_with_admin: true }), true);

  const summary = summarizeGoalsForAdmin([personalGoal], {
    share_personal_goals_with_admin: true,
  });
  assert.equal(Array.isArray(summary.personal_goals), true);
  assert.equal(summary.personal_goals[0].title, 'Private evening walk');
});
