const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyLegacyTodo, buildDirectMoveRepair } = require('../scripts/repairTodoPlanningHistory');

test('repair reconstructs one evidence-backed direct carry without inventing intermediate days', () => {
  const todo = {
    title: 'Legacy item', todoDate: '2026-09-23', status: 'pending', linkedTaskId: null,
    createdAt: new Date('2026-09-21T09:00:00.000Z'), updatedAt: new Date('2026-09-23T08:00:00.000Z'),
  };
  const classification = classifyLegacyTodo(todo);
  assert.deepEqual(classification, { kind: 'direct_move', fromDate: '2026-09-21', toDate: '2026-09-23' });
  const update = buildDirectMoveRepair(todo, classification);
  assert.equal(update.carryForwardCount, 1);
  assert.deepEqual(update.planningHistory.map((entry) => entry.plannedDate), ['2026-09-21', '2026-09-23']);
  assert.equal(update.planningHistory[0].statusAtDayEnd, 'moved_forward');
  assert.equal(update.planningHistory[1].carriedFromDate, '2026-09-21');
});

test('repair preserves known destination-day completion', () => {
  const todo = {
    todoDate: '2026-09-23', status: 'completed', linkedTaskId: '507f1f77bcf86cd799439011',
    createdAt: new Date('2026-09-22T09:00:00.000Z'), updatedAt: new Date('2026-09-23T10:00:00.000Z'),
    completedAt: new Date('2026-09-23T10:00:00.000Z'),
  };
  const update = buildDirectMoveRepair(todo);
  assert.equal(update.sourceType, 'task');
  assert.equal(update.planningHistory[1].statusAtDayEnd, 'completed');
  assert.deepEqual(update.planningHistory[1].completedAt, todo.completedAt);
});

test('repair skips ambiguous legacy records and is idempotent once history exists', () => {
  const ambiguous = { todoDate: '2026-09-23', createdAt: new Date('2026-09-21T09:00:00.000Z'), updatedAt: new Date('2026-09-22T09:00:00.000Z') };
  assert.equal(classifyLegacyTodo(ambiguous).kind, 'ambiguous');
  assert.equal(buildDirectMoveRepair(ambiguous), null);
  assert.deepEqual(classifyLegacyTodo({ ...ambiguous, planningHistory: [{ plannedDate: '2026-09-21' }] }), { kind: 'unchanged', reason: 'history_exists' });
});
