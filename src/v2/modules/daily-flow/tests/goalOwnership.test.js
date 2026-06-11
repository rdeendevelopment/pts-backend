const test = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../../../kernel/errors');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');

function assertOwnedGoal(goal, accountId) {
  if (!goal || goal.status === 'deleted' || String(goal.accountId) !== String(accountId)) {
    throw new AppError('Daily Flow goal not found', {
      status: 404,
      code: dailyFlowErrorCodes.DAILY_FLOW_GOAL_NOT_FOUND,
    });
  }
  return goal;
}

test('user cannot mutate another user goal', () => {
  const goal = {
    _id: '665f1c2d3e4f5a6b7c8d9e01',
    accountId: '665f1c2d3e4f5a6b7c8d9e0a',
    status: 'pending',
  };

  assert.throws(
    () => assertOwnedGoal(goal, '665f1c2d3e4f5a6b7c8d9e0b'),
    (err) => err instanceof AppError && err.code === dailyFlowErrorCodes.DAILY_FLOW_GOAL_NOT_FOUND
  );
});

test('deleted goals cannot be mutated', () => {
  const goal = {
    _id: '665f1c2d3e4f5a6b7c8d9e01',
    accountId: '665f1c2d3e4f5a6b7c8d9e0a',
    status: 'deleted',
  };

  assert.throws(
    () => assertOwnedGoal(goal, '665f1c2d3e4f5a6b7c8d9e0a'),
    (err) => err instanceof AppError && err.code === dailyFlowErrorCodes.DAILY_FLOW_GOAL_NOT_FOUND
  );
});
