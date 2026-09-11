const test = require('node:test');
const assert = require('node:assert/strict');
const { isActionableNotification, isImportantUpdate, dayWindow } = require('../services/taskInboxOverview.service');

test('Inbox attention accepts only actionable task events', () => {
  assert.equal(isActionableNotification({ type: 'task_mentioned' }), true);
  assert.equal(isActionableNotification({ type: 'task_assigned' }), true);
  assert.equal(isActionableNotification({ type: 'task_overdue' }), true);
  assert.equal(isActionableNotification({ type: 'task_updated' }), false);
});

test('Inbox queue excludes history-only events', () => {
  assert.equal(isImportantUpdate({ type: 'task_ready_for_review' }), true);
  assert.equal(isImportantUpdate({ type: 'task_completed' }), false);
  assert.equal(isImportantUpdate({ type: 'task_updated' }), false);
});

test('Inbox risk window is bounded to seven calendar days', () => {
  const { start, tomorrow, weekEnd } = dayWindow(new Date('2026-09-11T12:00:00Z'));
  assert.equal(tomorrow.getTime() - start.getTime(), 86400000);
  assert.equal(weekEnd.getTime() - start.getTime(), 7 * 86400000);
});
