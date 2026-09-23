const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport, daysBetween, outcomeForDay, planningEntries, reportRange } = require('../helpers/todoHistory.helper');
const repository = require('../repositories/todo.repository');
const { buildBackfillUpdate } = require('../scripts/backfillTodoPlanningHistory');
const { toDto } = require('../services/todo.service');

const id = '507f191e810c19729de860ea';
const completion = new Date('2026-09-18T12:00:00.000Z');
const carried = {
  _id: id, title: 'Multi-day plan', status: 'completed', priority: 'high', sourceType: 'personal',
  firstPlannedDate: '2026-09-15', currentPlannedDate: '2026-09-18', carryForwardCount: 3,
  completedAt: completion,
  completionEvents: [{ completedAt: completion, completedBy: id, plannedDate: '2026-09-18' }],
  planningHistory: [
    { plannedDate: '2026-09-15', source: 'created', statusAtDayEnd: 'moved_forward', movedToDate: '2026-09-16' },
    { plannedDate: '2026-09-16', source: 'carried_forward', carriedFromDate: '2026-09-15', statusAtDayEnd: 'moved_forward', movedToDate: '2026-09-17' },
    { plannedDate: '2026-09-17', source: 'carried_forward', carriedFromDate: '2026-09-16', statusAtDayEnd: 'moved_forward', movedToDate: '2026-09-18' },
    { plannedDate: '2026-09-18', source: 'carried_forward', carriedFromDate: '2026-09-17', statusAtDayEnd: 'completed', completedAt: completion },
  ],
};

test('planning overdue age and three carry-forward actions stay distinct', () => {
  assert.equal(daysBetween('2026-09-15', '2026-09-18'), 3);
  assert.equal(carried.carryForwardCount, 3);
  assert.equal(carried.planningHistory.filter((entry) => entry.source === 'carried_forward').length, 3);
});

test('historical outcomes remain pending/moved after later completion', () => {
  assert.deepEqual(outcomeForDay(carried, '2026-09-15'), {
    plannedDate: '2026-09-15', statusAtDayEnd: 'moved_forward', completedThisDay: false,
    movedToDate: '2026-09-16', laterCompletedDate: '2026-09-18',
  });
  assert.equal(outcomeForDay(carried, '2026-09-18').completedThisDay, true);
});

test('daily, weekly and monthly reports use the same immutable entries', () => {
  const daily = buildReport([carried], '2026-09-15', '2026-09-15');
  assert.equal(daily.totalPlanned, 1); assert.equal(daily.pendingAtDayEnd, 1); assert.equal(daily.completedWithinSameDay, 0);
  const weeklyRange = reportRange('weekly', '2026-09-18');
  const weekly = buildReport([carried], weeklyRange.startDate, weeklyRange.endDate);
  assert.equal(weekly.totalPlanned, 4); assert.equal(weekly.completedWithinSameDay, 1); assert.equal(weekly.completedAfterBeingCarried, 1);
  const monthlyRange = reportRange('monthly', '2026-09-18');
  const monthly = buildReport([carried], monthlyRange.startDate, monthlyRange.endDate);
  assert.equal(monthly.totalPlanned, 4); assert.equal(monthly.completedWithinSameDay, 1); assert.equal(monthly.completedAfterBeingCarried, 1);
});

test('task overdue and planning overdue are calculated independently', () => {
  const dto = toDto({ ...carried, status: 'pending', linkedTaskId: { _id: id, title: 'Board task', status: 'active', dueDate: new Date('2020-01-01'), isDeleted: false } }, null, '2026-09-18');
  assert.equal(dto.planningOverdueDays, 3); assert.equal(dto.taskOverdue, true); assert.equal(dto.sourceType, 'personal');
  const personal = toDto({ ...carried, status: 'pending', linkedTaskId: null, deadline: new Date('2020-01-01') }, null, '2026-09-18');
  assert.equal(personal.taskOverdue, false);
});

test('inaccessible linked tasks expose no task identifier or details', () => {
  const dto = toDto({ ...carried, sourceType: 'task', projectId: { _id: id, name: 'Secret', isDeleted: false }, linkedTaskId: { _id: id, title: 'Secret task', status: 'active', isDeleted: false } }, new Set(), '2026-09-18');
  assert.equal(dto.linkedTaskId, null); assert.equal(dto.linkedTask, null); assert.equal(dto.linkedTaskUnavailable, true);
});

test('legacy backfill preserves known completion and is idempotent', () => {
  const legacy = { _id: id, todoDate: '2026-09-15', status: 'completed', completedAt: new Date('2026-09-15T12:00:00Z'), completedBy: id, createdAt: new Date('2026-09-15T08:00:00Z'), linkedTaskId: id };
  const update = buildBackfillUpdate(legacy);
  assert.equal(update.firstPlannedDate, '2026-09-15'); assert.equal(update.sourceType, 'task'); assert.equal(update.planningHistory.length, 1);
  assert.equal(buildBackfillUpdate({ ...legacy, ...update }), null);
});

test('legacy todos remain visible and reportable before migration', () => {
  const legacy = { _id: id, todoDate: '2026-09-23', status: 'pending', priority: 'medium', planningHistory: [], createdAt: new Date('2026-09-23T08:00:00Z') };
  assert.equal(planningEntries(legacy)[0].plannedDate, '2026-09-23');
  assert.equal(buildReport([legacy], '2026-09-23', '2026-09-23').totalPlanned, 1);
  const query = repository.activeQuery({ createdBy: id, todoDate: '2026-09-23' });
  assert.equal(query.$or[1].todoDate, '2026-09-23');
});
