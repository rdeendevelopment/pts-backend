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
const todo = (overrides = {}) => ({ _id: todoId, title: 'Carry me', status: 'pending', priority: 'high', todoDate: '2026-09-20', createdBy: accountId, isDeleted: false, ...overrides });

test('outstanding returns pending historical items without mutating their dates', async () => {
  const original = repository.listOutstanding;
  const row = todo();
  repository.listOutstanding = async () => ({ items: [row], total: 1 });
  try {
    const result = await service.outstanding(req, { date: '2026-09-21' });
    assert.equal(result.items[0].todoDate, '2026-09-20');
    assert.equal(result.items[0].daysPending, 1);
    assert.equal(row.todoDate, '2026-09-20');
  } finally { repository.listOutstanding = original; }
});

test('moving a linked outstanding item is idempotent when today already has it', async () => {
  const originals = { findById: repository.findById, findActiveLinked: repository.findActiveLinked, softDelete: repository.softDelete };
  let deleted = 0;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  repository.findActiveLinked = async () => todo({ _id: '507f191e810c19729de860ef', todoDate: service.todayKey(), linkedTaskId: taskId });
  repository.softDelete = async () => { deleted += 1; };
  try {
    const result = await service.moveToToday(req, todoId, 'move');
    assert.equal(result.todoDate, service.todayKey());
    assert.equal(deleted, 1);
  } finally { Object.assign(repository, originals); }
});

test('move all carries each outstanding item to today without inventing records', async () => {
  const originals = { listAllOutstanding: repository.listAllOutstanding, findById: repository.findById, update: repository.update };
  const rows = [todo(), todo({ _id: '507f191e810c19729de860ed', title: 'Second' })];
  const updatedIds = [];
  repository.listAllOutstanding = async () => rows;
  repository.findById = async (id) => rows.find((item) => String(item._id) === String(id));
  repository.update = async (id, _owner, updates) => {
    updatedIds.push(String(id));
    return { ...rows.find((item) => String(item._id) === String(id)), ...updates };
  };
  try {
    const result = await service.moveAllOutstanding(req, { date: service.todayKey() });
    assert.equal(result.moved, 2);
    assert.deepEqual(updatedIds, rows.map((item) => String(item._id)));
    assert.ok(result.items.every((item) => item.todoDate === service.todayKey()));
  } finally { Object.assign(repository, originals); }
});

test('linked completion completes the task first and records successful audit fields', async () => {
  const originals = { findById: repository.findById, update: repository.update, taskFind: taskRepository.findById, completeTask: taskBoardService.completeTask, reopenTask: taskBoardService.reopenTask };
  let taskCompleted = 0;
  let saved;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  taskRepository.findById = async () => ({ _id: taskId, projectId, status: 'active' });
  taskBoardService.completeTask = async () => { taskCompleted += 1; };
  repository.update = async (_id, _owner, updates) => { saved = updates; return todo({ ...updates, linkedTaskId: taskId }); };
  try {
    const result = await service.complete(req, todoId, 'my_day_and_task');
    assert.equal(taskCompleted, 1);
    assert.equal(result.status, 'completed');
    assert.equal(saved.linkedTaskCompletionRequested, true);
    assert.equal(saved.linkedTaskCompletionSucceeded, true);
  } finally { repository.findById = originals.findById; repository.update = originals.update; taskRepository.findById = originals.taskFind; taskBoardService.completeTask = originals.completeTask; taskBoardService.reopenTask = originals.reopenTask; }
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
  const originals = { findById: repository.findById, update: repository.update, taskFind: taskRepository.findById, completeTask: taskBoardService.completeTask };
  let taskCompleted = 0;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  repository.update = async (_id, _owner, updates) => todo({ ...updates, linkedTaskId: taskId });
  taskRepository.findById = async () => ({ _id: taskId, projectId, status: 'completed' });
  taskBoardService.completeTask = async () => { taskCompleted += 1; };
  try {
    const result = await service.complete(req, todoId, 'my_day_and_task');
    assert.equal(result.status, 'completed');
    assert.equal(taskCompleted, 0);
  } finally { repository.findById = originals.findById; repository.update = originals.update; taskRepository.findById = originals.taskFind; taskBoardService.completeTask = originals.completeTask; }
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
  const originals = { findById: repository.findById, update: repository.update, reopenTask: taskBoardService.reopenTask };
  let taskReopened = false;
  repository.findById = async () => todo({ status: 'completed', linkedTaskId: taskId });
  repository.update = async (_id, _owner, updates) => todo({ ...updates, linkedTaskId: taskId });
  taskBoardService.reopenTask = async () => { taskReopened = true; };
  try {
    const result = await service.reopen(req, todoId);
    assert.equal(result.status, 'pending');
    assert.equal(taskReopened, false);
  } finally { repository.findById = originals.findById; repository.update = originals.update; taskBoardService.reopenTask = originals.reopenTask; }
});

test('a persisted task completion is compensated if completing My Day fails', async () => {
  const originals = { findById: repository.findById, update: repository.update, taskFind: taskRepository.findById, completeTask: taskBoardService.completeTask, reopenTask: taskBoardService.reopenTask };
  let taskCompleted = false;
  let taskReopened = false;
  repository.findById = async () => todo({ linkedTaskId: taskId });
  repository.update = async () => { throw new Error('todo write failed'); };
  taskRepository.findById = async () => ({ _id: taskId, projectId, status: 'active' });
  taskBoardService.completeTask = async () => { taskCompleted = true; };
  taskBoardService.reopenTask = async () => { taskReopened = true; };
  try {
    await assert.rejects(service.complete(req, todoId, 'my_day_and_task'), /todo write failed/);
    assert.equal(taskCompleted, true);
    assert.equal(taskReopened, true);
  } finally { repository.findById = originals.findById; repository.update = originals.update; taskRepository.findById = originals.taskFind; taskBoardService.completeTask = originals.completeTask; taskBoardService.reopenTask = originals.reopenTask; }
});
