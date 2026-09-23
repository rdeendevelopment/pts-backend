const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../repositories/todo.repository');
const service = require('../services/todo.service');

const accountId = '507f1f77bcf86cd799439011';
const todoId = '507f191e810c19729de860ea';
const req = { v2Auth: { accountId, account: { accountType: 'super_admin' }, sessionAccess: { roles: [] } } };
const base = { _id: todoId, title: 'Review upload', status: 'pending', priority: 'medium', todoDate: '2026-09-21', firstPlannedDate: '2026-09-21', currentPlannedDate: '2026-09-21', planningHistory: [{ plannedDate: '2026-09-21', source: 'created', statusAtDayEnd: 'pending' }], carryForwardCount: 0, createdBy: accountId, isDeleted: false };

test('creates a minimal todo with production defaults', async () => {
  const original = repository.create;
  repository.create = async (payload) => ({ ...base, ...payload });
  try {
    const created = await service.create(req, { title: '  Review upload  ', todoDate: '2026-09-21' });
    assert.equal(created.title, 'Review upload');
    assert.equal(created.priority, 'medium');
    assert.equal(created.status, 'pending');
    assert.equal(created.projectId, null);
  } finally { repository.create = original; }
});

test('creates optional detail fields without requiring them', async () => {
  const original = repository.create;
  let saved;
  repository.create = async (payload) => { saved = payload; return { ...base, ...payload }; };
  try {
    await service.create(req, { title: 'Plan release', todoDate: '2026-09-21', priority: 'high', notes: 'Check QA', deadline: '2026-09-21T18:00:00.000Z', reminderAt: '2026-09-21T17:00:00.000Z' });
    assert.equal(saved.priority, 'high');
    assert.equal(saved.notes, 'Check QA');
    assert.ok(saved.deadline instanceof Date);
    assert.ok(saved.reminderAt instanceof Date);
  } finally { repository.create = original; }
});

test('rejects a manually linked task when no authorized project is supplied', async () => {
  await assert.rejects(
    service.create(req, { title: 'Tampered request', todoDate: '2026-09-21', linkedTaskId: todoId }),
    /project is required/i
  );
});

test('complete and reopen persist completion audit fields', async () => {
  const originals = { findById: repository.findById, complete: repository.complete, reopen: repository.reopen };
  let current = { ...base };
  repository.findById = async () => current;
  repository.complete = async (_id, _account, values) => (current = { ...current, status: 'completed', completedAt: values.completedAt, completedBy: values.completedBy });
  repository.reopen = async () => (current = { ...current, status: 'pending', completedAt: null, completedBy: null });
  try {
    const completed = await service.complete(req, todoId);
    assert.equal(completed.status, 'completed'); assert.equal(completed.completedBy, accountId); assert.ok(completed.completedAt);
    const reopened = await service.reopen(req, todoId);
    assert.equal(reopened.status, 'pending'); assert.equal(reopened.completedAt, null); assert.equal(reopened.completedBy, null);
  } finally { Object.assign(repository, originals); }
});

test('edit and soft delete remain owner scoped', async () => {
  const originals = { findById: repository.findById, update: repository.update, softDelete: repository.softDelete };
  repository.findById = async () => ({ ...base });
  repository.update = async (_id, owner, updates) => ({ ...base, ...updates, createdBy: owner });
  let deletedOwner;
  repository.softDelete = async (_id, owner) => { deletedOwner = owner; return { ...base, isDeleted: true }; };
  try {
    const updated = await service.update(req, todoId, { title: 'Updated', priority: 'low' });
    assert.equal(updated.title, 'Updated'); assert.equal(updated.priority, 'low');
    const deleted = await service.remove(req, todoId);
    assert.equal(deleted.deleted, true); assert.equal(deletedOwner, accountId);
  } finally { Object.assign(repository, originals); }
});

test('list passes project, status, priority, date, sorting and pagination to repository', async () => {
  const originals = { list: repository.list, listForReport: repository.listForReport, listOutstandingOnDate: repository.listOutstandingOnDate };
  let call;
  repository.list = async (filters, options) => { call = { filters, options }; return { items: [], total: 0 }; };
  repository.listForReport = async () => [];
  repository.listOutstandingOnDate = async () => [];
  try {
    const result = await service.list(req, { date: '2026-09-20', status: 'overdue', priority: 'high', projectId: 'personal', sort: 'deadline', page: 2, limit: 20 });
    assert.deepEqual(call.filters, { createdBy: accountId, todoDate: '2026-09-20', status: 'overdue', priority: 'high', projectId: null });
    assert.deepEqual(call.options, { page: 2, limit: 20, sort: 'deadline' });
    assert.equal(result.summary.total, 0);
  } finally { Object.assign(repository, originals); }
});

test('daily summary and moving pending work to today are supported', async () => {
  const originals = { listForReport: repository.listForReport, listOutstandingOnDate: repository.listOutstandingOnDate, findById: repository.findById, carryForward: repository.carryForward };
  repository.listForReport = async () => [
    { ...base, status: 'completed', planningHistory: [{ plannedDate: '2026-09-21', statusAtDayEnd: 'completed', completedAt: '2026-09-21T12:00:00Z' }] },
    { ...base, _id: '507f191e810c19729de860eb', status: 'completed', planningHistory: [{ plannedDate: '2026-09-21', statusAtDayEnd: 'completed', completedAt: '2026-09-21T13:00:00Z' }] },
    { ...base, _id: '507f191e810c19729de860ec', status: 'completed', planningHistory: [{ plannedDate: '2026-09-21', statusAtDayEnd: 'completed', completedAt: '2026-09-21T14:00:00Z' }] },
    { ...base, _id: '507f191e810c19729de860ed' },
  ];
  repository.listOutstandingOnDate = async () => [];
  repository.findById = async () => ({ ...base, todoDate: '2026-09-20', currentPlannedDate: '2026-09-20', planningHistory: [{ plannedDate: '2026-09-20', statusAtDayEnd: 'pending' }] });
  repository.carryForward = async (_id, _owner, values) => ({ ...base, todoDate: values.toDate, currentPlannedDate: values.toDate, planningHistory: [{ plannedDate: '2026-09-20' }, { plannedDate: values.toDate }] });
  try {
    assert.equal((await service.summary(req, { date: '2026-09-21' })).completionPercentage, 75);
    assert.equal((await service.moveToToday(req, todoId, 'move')).todoDate, service.todayKey());
  } finally { Object.assign(repository, originals); }
});

test('repository summary returns the aggregation row instead of an array-shaped zero summary', async () => {
  const rows = [{ _id: null, total: 5, completed: 2, pending: 3, highPriority: 1 }];
  assert.deepEqual(repository.normalizeSummary(rows), rows[0]);
  assert.deepEqual(repository.normalizeSummary([]), { total: 0, completed: 0, pending: 0, highPriority: 0 });
});
