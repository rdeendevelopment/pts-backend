const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRuleBasedFlowMateState,
  parseFlowMateStateJson,
  resolveSemanticMode,
} = require('../helpers/flowMateState.helper');

const baseContext = {
  userName: 'Usama',
  dayKey: '2026-06-08',
  dayStatus: 'active',
  assignedTaskCount: 15,
  plannedWork: [],
  pendingWork: [],
  completedWork: [],
  personalGoalsCount: 2,
  personalGoalsCompleted: 1,
  suggestions: [
    {
      taskId: 'aaa',
      title: 'Multi Tenant Admin Panel',
      priority: 'medium',
      status: 'active',
      ruleReason: 'Active and already in progress',
    },
    {
      taskId: 'bbb',
      title: 'threads Failed',
      priority: 'high',
      status: 'active',
      ruleReason: 'High priority assigned task',
    },
  ],
  primaryCandidate: {
    taskId: 'aaa',
    title: 'Multi Tenant Admin Panel',
    priority: 'medium',
    status: 'active',
    ruleReason: 'Active and already in progress',
  },
  nextCandidate: {
    taskId: 'bbb',
    title: 'threads Failed',
    priority: 'high',
    status: 'active',
    ruleReason: 'High priority assigned task',
  },
};

describe('flowMateState.helper', () => {
  it('day_opened with no plan uses morning_planner', () => {
    const mode = resolveSemanticMode(baseContext, 'day_opened');
    assert.equal(mode, 'morning_planner');
    const state = buildRuleBasedFlowMateState(baseContext, 'day_opened');
    assert.equal(state.mode, 'morning_planner');
    assert.ok(state.message.includes('assigned task'));
    assert.equal(state.primaryTask?.title, 'Multi Tenant Admin Panel');
    assert.ok(state.primaryTask);
    assert.equal(state.fallbackUsed, true);
  });

  it('day_opened with planned items uses work_companion', () => {
    const ctx = {
      ...baseContext,
      plannedWork: [{ title: 'Deploy PTS', status: 'in_progress' }],
      pendingWork: [{ title: 'Deploy PTS', status: 'in_progress' }],
    };
    const state = buildRuleBasedFlowMateState(ctx, 'day_opened');
    assert.equal(state.mode, 'work_companion');
  });

  it('task_added_to_today uses plan_updated', () => {
    const ctx = {
      ...baseContext,
      entityTitle: 'Multi Tenant Admin Panel',
      plannedWork: [{ title: 'Multi Tenant Admin Panel' }],
      pendingWork: [{ title: 'Multi Tenant Admin Panel' }],
    };
    const state = buildRuleBasedFlowMateState(ctx, 'task_added_to_today');
    assert.equal(state.mode, 'plan_updated');
    assert.ok(state.message.includes('Multi Tenant Admin Panel'));
  });

  it('personal_goal_completed uses soft celebration', () => {
    const ctx = { ...baseContext, isPersonalGoal: true };
    const state = buildRuleBasedFlowMateState(ctx, 'personal_goal_completed');
    assert.equal(state.mode, 'personal_goal_completed');
    assert.equal(state.celebration.level, 'soft');
    assert.equal(state.nudge.type, 'privacy');
  });

  it('day_submitted uses end_day_reporter', () => {
    const ctx = {
      ...baseContext,
      dayStatus: 'submitted',
      completedWork: [{ title: 'Done task' }],
      endDayReport: { totalActivityMinutes: 120, tomorrowPlan: 'Ship feature' },
    };
    const state = buildRuleBasedFlowMateState(ctx, 'day_submitted');
    assert.equal(state.mode, 'end_day_reporter');
    assert.ok(state.message.includes('private'));
  });

  it('parseFlowMateStateJson merges valid AI JSON', () => {
    const json = JSON.stringify({
      mode: 'morning_planner',
      event: 'day_opened',
      headline: 'Focus time',
      message: 'Hello Usama.\nLine 2.',
      bullets: ['15 tasks'],
      primaryTask: {
        taskId: 'aaa',
        title: 'Multi Tenant Admin Panel',
        priority: 'medium',
        status: 'active',
        reason: 'In progress',
      },
      nextTask: null,
      actions: [{ type: 'open_task', label: 'Open Task', taskId: 'aaa' }],
      celebration: { enabled: false, level: 'none', reason: null },
      nudge: { type: 'focus', text: 'One task at a time.' },
    });
    const parsed = parseFlowMateStateJson(json, baseContext, 'day_opened');
    assert.ok(parsed);
    assert.equal(parsed.fallbackUsed, false);
    assert.equal(parsed.recommendationMode, 'openai');
  });
});
