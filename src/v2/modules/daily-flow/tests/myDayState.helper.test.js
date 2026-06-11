const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateMyDayState,
  buildFlowMateCacheKey,
  shouldReuseFlowMateCache,
  shouldInvalidateFlowMateCache,
  getTimeOfDay,
} = require('../helpers/myDayState.helper');
const { buildRuleBasedFlowMateState } = require('../helpers/flowMateState.helper');

const TZ = 'America/New_York';
const MORNING_NY = new Date('2026-06-08T14:00:00.000Z'); // 10:00 EDT
const AFTERNOON_NY = new Date('2026-06-08T20:00:00.000Z'); // 16:00 EDT

function stateAt(when, overrides = {}) {
  return calculateMyDayState({
    timezone: TZ,
    now: when,
    ...overrides,
  });
}

describe('myDayState.helper', () => {
  it('morning first open with no plan is not_started', () => {
    const result = stateAt(MORNING_NY, { todayItemsCount: 0, completedItemsCount: 0 });
    assert.equal(result.dayState, 'not_started');
    assert.equal(result.timeOfDay, 'morning');
    assert.equal(result.shouldCreatePlan, true);
    assert.equal(result.shouldResumePlan, false);
  });

  it('items added but none completed is planned', () => {
    const result = stateAt(MORNING_NY, { todayItemsCount: 2, completedItemsCount: 0 });
    assert.equal(result.dayState, 'planned');
    assert.equal(result.hasExistingPlan, true);
    assert.equal(result.shouldResumePlan, true);
    assert.equal(result.shouldShowEndDay, true);
  });

  it('completed items is in_progress', () => {
    const result = stateAt(MORNING_NY, { todayItemsCount: 3, completedItemsCount: 1 });
    assert.equal(result.dayState, 'in_progress');
    assert.equal(result.shouldResumePlan, true);
  });

  it('activity minutes without completions is in_progress', () => {
    const result = stateAt(MORNING_NY, { todayItemsCount: 0, completedItemsCount: 0, activityMinutes: 30 });
    assert.equal(result.dayState, 'in_progress');
  });

  it('afternoon first open with no plan is quiet_day', () => {
    const result = stateAt(AFTERNOON_NY, { todayItemsCount: 0, completedItemsCount: 0 });
    assert.equal(result.dayState, 'quiet_day');
    assert.equal(result.timeOfDay, 'afternoon');
    assert.equal(result.shouldCreatePlan, true);
  });

  it('end day report is submitted', () => {
    const result = stateAt(MORNING_NY, {
      todayItemsCount: 2,
      completedItemsCount: 1,
      endDayReport: { status: 'submitted' },
    });
    assert.equal(result.dayState, 'submitted');
    assert.equal(result.hasExistingPlan, false);
    assert.equal(result.shouldCreatePlan, false);
    assert.equal(result.shouldShowEndDay, false);
  });

  it('cache key changes when day state changes', () => {
    const base = {
      userId: 'user1',
      dayKey: '2026-06-08',
      event: 'day_opened',
      plannedItemCount: 0,
      completedItemCount: 0,
      timeOfDay: 'morning',
    };
    const morning = buildFlowMateCacheKey({ ...base, dayState: 'not_started' });
    const planned = buildFlowMateCacheKey({ ...base, dayState: 'planned', plannedItemCount: 2 });
    assert.notEqual(morning, planned);
  });

  it('day_opened reuses cache; task_added invalidates', () => {
    assert.equal(shouldReuseFlowMateCache('day_opened'), true);
    assert.equal(shouldReuseFlowMateCache('manual_refresh'), true);
    assert.equal(shouldInvalidateFlowMateCache('task_added_to_today'), true);
    assert.equal(shouldInvalidateFlowMateCache('day_submitted'), true);
  });
});

describe('myDayState FlowMate messages', () => {
  const suggestions = [
    { taskId: 'a', title: 'Task A', priority: 'high', status: 'active', alreadyAddedToToday: false },
    { taskId: 'b', title: 'Task B', priority: 'medium', status: 'active', alreadyAddedToToday: true },
  ];

  it('planned reload uses welcome back resume message', () => {
    const state = buildRuleBasedFlowMateState({
      userName: 'Usama',
      dayKey: '2026-06-08',
      assignedTaskCount: 5,
      plannedWork: [{ title: 'Deploy PTS' }],
      pendingWork: [{ title: 'Deploy PTS' }],
      completedWork: [],
      todayItemsCount: 2,
      suggestions,
      myDayState: calculateMyDayState({ todayItemsCount: 2, completedItemsCount: 0 }),
    }, 'day_opened');
    assert.ok(state.message.includes('Welcome back'));
    assert.ok(state.message.includes('already set'));
    assert.equal(state.dayState, 'planned');
  });

  it('in_progress reload uses progress message', () => {
    const state = buildRuleBasedFlowMateState({
      userName: 'Usama',
      dayKey: '2026-06-08',
      plannedWork: [{ title: 'Done' }, { title: 'Next' }],
      pendingWork: [{ title: 'Next' }],
      completedWork: [{ title: 'Done' }],
      todayItemsCount: 2,
      suggestions,
      myDayState: calculateMyDayState({ todayItemsCount: 2, completedItemsCount: 1 }),
    }, 'day_opened');
    assert.ok(state.message.includes('completed 1 of 2'));
    assert.equal(state.dayState, 'in_progress');
  });

  it('afternoon not_started avoids Good morning', () => {
    const state = buildRuleBasedFlowMateState({
      userName: 'Usama',
      dayKey: '2026-06-08',
      assignedTaskCount: 3,
      suggestions,
      myDayState: {
        dayState: 'not_started',
        timeOfDay: 'afternoon',
        hasExistingPlan: false,
        shouldCreatePlan: true,
        shouldResumePlan: false,
        shouldShowEndDay: false,
      },
    }, 'day_opened');
    assert.ok(state.message.includes('Good afternoon'));
    assert.ok(!state.message.includes('Good morning'));
  });

  it('quiet_day uses gentle afternoon message', () => {
    const state = buildRuleBasedFlowMateState({
      userName: 'Usama',
      dayKey: '2026-06-08',
      assignedTaskCount: 2,
      suggestions,
      primaryCandidate: suggestions[0],
      myDayState: calculateMyDayState({
        timezone: TZ,
        now: AFTERNOON_NY,
        todayItemsCount: 0,
        completedItemsCount: 0,
      }),
    }, 'day_opened');
    assert.equal(state.mode, 'quiet_day');
    assert.ok(state.message.toLowerCase().includes('afternoon'));
  });

  it('submitted reload uses closed day summary', () => {
    const state = buildRuleBasedFlowMateState({
      userName: 'Usama',
      dayKey: '2026-06-08',
      dayStatus: 'submitted',
      endDayReport: { aiSummary: 'Solid day.', tomorrowPlan: 'Ship feature' },
      myDayState: calculateMyDayState({
        endDayReport: { status: 'submitted' },
        todayItemsCount: 2,
        completedItemsCount: 2,
      }),
    }, 'day_opened');
    assert.ok(state.message.includes('already submitted'));
  });
});
