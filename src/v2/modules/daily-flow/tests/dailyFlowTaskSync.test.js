const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isLinkedSyncGoal } = require('../services/dailyFlowTaskSync.service');
const { SYNC_EVENTS } = require('../helpers/taskSyncAudit.helper');
const { buildRuleBasedFlowMateState } = require('../helpers/flowMateState.helper');

describe('dailyFlowTaskSync.service', () => {
  it('isLinkedSyncGoal requires sync flag and task link', () => {
    assert.equal(isLinkedSyncGoal({
      type: 'work',
      syncTaskStatus: true,
      linkedTaskId: '664a1b2c3d4e5f678901234',
    }), true);

    assert.equal(isLinkedSyncGoal({
      type: 'work',
      syncTaskStatus: false,
      linkedTaskId: '664a1b2c3d4e5f678901234',
    }), false);

    assert.equal(isLinkedSyncGoal({
      type: 'personal',
      syncTaskStatus: true,
      linkedTaskId: '664a1b2c3d4e5f678901234',
    }), false);

    assert.equal(isLinkedSyncGoal({
      type: 'work',
      syncTaskStatus: true,
      sourceType: 'manual',
    }), false);
  });

  it('audit events include both directions', () => {
    assert.ok(SYNC_EVENTS.includes('my_day_goal_completed_task_completed'));
    assert.ok(SYNC_EVENTS.includes('my_day_goal_reopened_task_reopened'));
    assert.ok(SYNC_EVENTS.includes('task_completed_my_day_goal_completed'));
    assert.ok(SYNC_EVENTS.includes('task_reopened_my_day_goal_reopened'));
  });
});

describe('flowMate reopen messages', () => {
  it('task_reopened explains linked Task Board reopen calmly', () => {
    const state = buildRuleBasedFlowMateState({
      userName: 'Usama',
      entityTitle: 'Deploy PTS',
      pendingWork: [{ title: 'Client follow-up' }],
      taskSync: { synced: true },
      suggestions: [],
    }, 'task_reopened');

    assert.ok(state.message.includes('back to in progress'));
    assert.ok(state.message.includes('Task Board task was reopened'));
    assert.ok(!state.message.toLowerCase().includes('mistake'));
  });

  it('goal_reopened from My Day stays neutral', () => {
    const state = buildRuleBasedFlowMateState({
      userName: 'Usama',
      entityTitle: 'Deploy PTS',
      pendingWork: [{ title: 'Deploy PTS' }],
      taskSync: { synced: true },
      suggestions: [],
    }, 'goal_reopened');

    assert.ok(state.message.includes('open again'));
    assert.ok(state.message.includes('Task Board is updated'));
  });
});
