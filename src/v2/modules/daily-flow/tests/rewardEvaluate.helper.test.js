const test = require('node:test');
const assert = require('node:assert/strict');
const { HEALTHY_HABIT_CATEGORIES } = require('../constants/dailyFlow.constants');

function matchesHealthyHabitCategory(category) {
  const normalized = String(category || '').toLowerCase();
  return HEALTHY_HABIT_CATEGORIES.some((value) => normalized.includes(value));
}

function shouldCreateReward(existingReward, eligible) {
  if (existingReward) {
    return { created: false, reward: existingReward };
  }
  if (!eligible) {
    return { created: false, reward: null };
  }
  return { created: true, reward: { id: 'new-reward' } };
}

test('duplicate reward is not created when rule already exists', () => {
  const existing = { rule_key: '3_day_consistency' };
  const result = shouldCreateReward(existing, true);
  assert.equal(result.created, false);
  assert.equal(result.reward, existing);
});

test('healthy habit category matcher accepts seed categories', () => {
  assert.equal(matchesHealthyHabitCategory('healthy_habit'), true);
  assert.equal(matchesHealthyHabitCategory('Wellness Routine'), true);
  assert.equal(matchesHealthyHabitCategory('delivery'), false);
});
