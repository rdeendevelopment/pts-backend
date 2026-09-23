const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../repositories/todo.repository');
const taskRepository = require('../../tasks/repositories/task.repository');
const taskBoardService = require('../../tasks/services/taskBoard.service');
const service = require('../services/todo.service');

const accountId = '507f1f77bcf86cd799439011';
const todoId = '507f191e810c19729de860ea';
const taskId = '507f191e810c19729de860eb';
const projectId = '507f191e810c19729de860ec';
const req = { v2Auth: { accountId, account: { accountType: 'super_admin' }, sessionAccess: { roles: [] } } };
const todo = (overrides = {}) => ({ _id: todoId, title: 'Carry me', status: 'pending', priority: 'high', todoDate: '2026-09-20', firstPlannedDate: '2026-09-20', currentPlannedDate: '2026-09-20', planningHistory: [{ plannedDate: '2026-09-20', source: 'created', statusAtDayEnd: 'pending' }], carryForwardCount: 0, createdBy: accountId, isDeleted: false, ...overrides });

test('outstanding returns pending historical items with their later completion truth', async () => {
  const original = repository.listOutstandingOnDate;
  const row = todo({
    status: 'completed', completedAt: new Date('2026-09-23T12:00:00.000Z'),
    completionEvents: [{ completedAt: new Date('2026-09-23T12:00:00.000Z'), completedBy: accountId, plannedDate: '2026-09-23' }],
  });
  repository.listOutstandingOnDate = async () => [row];
  try {
    const result = await service.outstanding(req, { date: '2026-09-21' });
    assert.equal(result.items[0].todoDate, '2026-09-20');
    assert.equal(result.items[0].daysPending, 1);
    assert.equal(result.items[0].status, 'pending');
    assert.equal(result.items[0].currentStatus, 'completed');
    assert.equal(result.items[0].dayOutcome.statusAtDayEnd, 'pending');
    assert.equal(result.items[0].dayOutcome.laterCompletedDate, '2026-09-23');
    assert.equal(row.todoDate, '2026-09-20');
  } finally { repository.listOutstandingOnDate = original; }
});

test('moving a linked outstanding item is idempotent when today already has it', async () => {
  const originals = { findById: repository.findById, findActiveLinked: repository.findActiveLinked, mergeCarryForward: repository.mergeCarryForward };
  let merged = 0;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  repository.findActiveLinked = async () => todo({ _id: '507f191e810c19729de860ef', todoDate: service.todayKey(), currentPlannedDate: service.todayKey(), linkedTaskId: taskId });
  repository.mergeCarryForward = async (_source, target) => { merged += 1; return target; };
  try {
    const result = await service.moveToToday(req, todoId, 'move');
    assert.equal(result.todoDate, service.todayKey());
    assert.equal(merged, 1);
  } finally { Object.assign(repository, originals); }
});

test('move all carries each outstanding item to today without inventing records', async () => {
  const originals = { listAllOutstanding: repository.listAllOutstanding, findById: repository.findById, carryForward: repository.carryForward };
  const rows = [todo(), todo({ _id: '507f191e810c19729de860ed', title: 'Second' })];
  const updatedIds = [];
  repository.listAllOutstanding = async () => rows;
  repository.findById = async (id) => rows.find((item) => String(item._id) === String(id));
  repository.carryForward = async (id, _owner, values) => {
    updatedIds.push(String(id));
    return { ...rows.find((item) => String(item._id) === String(id)), todoDate: values.toDate, currentPlannedDate: values.toDate };
  };
  try {
    const result = await service.moveAllOutstanding(req, { date: service.todayKey() });
    assert.equal(result.moved, 2);
    assert.deepEqual(updatedIds, rows.map((item) => String(item._id)));
    assert.ok(result.items.every((item) => item.todoDate === service.todayKey()));
  } finally { Object.assign(repository, originals); }
});

test('moving the same item twice and rerunning move-all do not duplicate today', async () => {
  const originals = { listAllOutstanding: repository.listAllOutstanding, findById: repository.findById, carryForward: repository.carryForward };
  const destination = service.todayKey();
  let current = todo(); let writes = 0;
  repository.findById = async () => current;
  repository.listAllOutstanding = async () => current.currentPlannedDate < destination ? [current] : [];
  repository.carryForward = async (_id, _owner, values) => {
    writes += 1;
    current = { ...current, todoDate: values.toDate, currentPlannedDate: values.toDate, carryForwardCount: 1, planningHistory: [...current.planningHistory, { plannedDate: values.toDate, source: 'carried_forward', statusAtDayEnd: 'pending' }] };
    return current;
  };
  try {
    await service.moveToToday(req, todoId, 'move');
    await service.moveToToday(req, todoId, 'move');
    const rerun = await service.moveAllOutstanding(req);
    assert.equal(writes, 1); assert.equal(rerun.moved, 0);
    assert.equal(current.planningHistory.filter((entry) => entry.plannedDate === destination).length, 1);
  } finally { Object.assign(repository, originals); }
});

test('linked completion completes the task first and records successful audit fields', async () => {
  const originals = { findById: repository.findById, complete: repository.complete, taskFind: taskRepository.findById, completeTask: taskBoardService.completeTask, reopenTask: taskBoardService.reopenTask };
  let taskCompleted = 0;
  let saved;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  taskRepository.findById = async () => ({ _id: taskId, projectId, status: 'active' });
  taskBoardService.completeTask = async () => { taskCompleted += 1; };
  repository.complete = async (_id, _owner, values) => { saved = values.extra; return todo({ status: 'completed', completedAt: values.completedAt, linkedTaskId: taskId, ...values.extra }); };
  try {
    const result = await service.complete(req, todoId, 'my_day_and_task');
    assert.equal(taskCompleted, 1);
    assert.equal(result.status, 'completed');
    assert.equal(saved.linkedTaskCompletionRequested, true);
    assert.equal(saved.linkedTaskCompletionSucceeded, true);
  } finally { repository.findById = originals.findById; repository.complete = originals.complete; taskRepository.findById = originals.taskFind; taskBoardService.completeTask = originals.completeTask; taskBoardService.reopenTask = originals.reopenTask; }
});

test('failed linked task completion leaves the My Day item pending', async () => {
  const originals = { findById: repository.findById, update: repository.update, taskFind: taskRepository.findById, completeTask: taskBoardService.completeTask, reopenTask: taskBoardService.reopenTask };
  let todoUpdated = false;
  let taskReopened = false;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  repository.update = async () => { todoUpdated = true; };
  taskRepository.findById = async () => ({ _id: taskId, projectId, status: 'active' });
  taskBoardService.completeTask = async () => { throw new Error('permission denied'); };
  taskBoardService.reopenTask = async () => { taskReopened = true; };
  try {
    await assert.rejects(service.complete(req, todoId, 'my_day_and_task'), /permission denied/);
    assert.equal(todoUpdated, false);
    assert.equal(taskReopened, false);
  } finally { repository.findById = originals.findById; repository.update = originals.update; taskRepository.findById = originals.taskFind; taskBoardService.completeTask = originals.completeTask; taskBoardService.reopenTask = originals.reopenTask; }
});

test('an already-completed linked task is not completed again', async () => {
  const originals = { findById: repository.findById, complete: repository.complete, taskFind: taskRepository.findById, completeTask: taskBoardService.completeTask };
  let taskCompleted = 0;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  repository.complete = async (_id, _owner, values) => todo({ status: 'completed', completedAt: values.completedAt, linkedTaskId: taskId });
  taskRepository.findById = async () => ({ _id: taskId, projectId, status: 'completed' });
  taskBoardService.completeTask = async () => { taskCompleted += 1; };
  try {
    const result = await service.complete(req, todoId, 'my_day_and_task');
    assert.equal(result.status, 'completed');
    assert.equal(taskCompleted, 0);
  } finally { repository.findById = originals.findById; repository.complete = originals.complete; taskRepository.findById = originals.taskFind; taskBoardService.completeTask = originals.completeTask; }
});

test('an unavailable linked task cannot be completed through My Day', async () => {
  const originals = { findById: repository.findById, update: repository.update, taskFind: taskRepository.findById, completeTask: taskBoardService.completeTask };
  let todoUpdated = false;
  let taskCompleted = false;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  repository.update = async () => { todoUpdated = true; };
  taskRepository.findById = async () => null;
  taskBoardService.completeTask = async () => { taskCompleted = true; };
  try {
    await assert.rejects(service.complete(req, todoId, 'my_day_and_task'), /unavailable/i);
    assert.equal(todoUpdated, false);
    assert.equal(taskCompleted, false);
  } finally { repository.findById = originals.findById; repository.update = originals.update; taskRepository.findById = originals.taskFind; taskBoardService.completeTask = originals.completeTask; }
});

test('linked task availability flags distinguish archived and already-completed tasks', () => {
  const archived = service.toDto(todo({ linkedTaskId: { _id: taskId, title: 'Archived', status: 'archived', isDeleted: false } }));
  const completed = service.toDto(todo({ linkedTaskId: { _id: taskId, title: 'Done', status: 'completed', isDeleted: false } }));
  assert.equal(archived.linkedTaskUnavailable, true);
  assert.equal(archived.linkedTask, null);
  assert.equal(completed.linkedTaskUnavailable, false);
  assert.equal(completed.linkedTaskAlreadyCompleted, true);
});

test('reopening My Day never reopens its linked Task Board task', async () => {
  const originals = { findById: repository.findById, reopen: repository.reopen, reopenTask: taskBoardService.reopenTask };
  let taskReopened = false;
  repository.findById = async () => todo({ status: 'completed', linkedTaskId: taskId });
  repository.reopen = async () => todo({ status: 'pending', completedAt: null, completedBy: null, linkedTaskId: taskId });
  taskBoardService.reopenTask = async () => { taskReopened = true; };
  try {
    const result = await service.reopen(req, todoId);
    assert.equal(result.status, 'pending');
    assert.equal(taskReopened, false);
  } finally { repository.findById = originals.findById; repository.reopen = originals.reopen; taskBoardService.reopenTask = originals.reopenTask; }
});

test('a persisted task completion is compensated if completing My Day fails', async () => {
  const originals = { findById: repository.findById, complete: repository.complete, taskFind: taskRepository.findById, completeTask: taskBoardService.completeTask, reopenTask: taskBoardService.reopenTask };
  let taskCompleted = false;
  let taskReopened = false;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  repository.complete = async () => { throw new Error('todo write failed'); };
  taskRepository.findById = async () => ({ _id: taskId, projectId, status: 'active' });
  taskBoardService.completeTask = async () => { taskCompleted = true; };
  taskBoardService.reopenTask = async () => { taskReopened = true; };
  try {
    await assert.rejects(service.complete(req, todoId, 'my_day_and_task'), /todo write failed/);
    assert.equal(taskCompleted, true);
    assert.equal(taskReopened, true);
  } finally { repository.findById = originals.findById; repository.complete = originals.complete; taskRepository.findById = originals.taskFind; taskBoardService.completeTask = originals.completeTask; taskBoardService.reopenTask = originals.reopenTask; }
});
