const test = require('node:test');
const assert = require('node:assert/strict');
const taskBoardService = require('../services/taskBoard.service');
const taskRepository = require('../repositories/task.repository');
const taskWorkflowStatusRepository = require('../repositories/taskWorkflowStatus.repository');
const taskAccessService = require('../services/taskAccess.service');
const taskActivityService = require('../services/taskActivity.service');
const taskNotificationPolicy = require('../services/taskNotificationPolicy.service');
const accountRepository = require('../../auth/repositories/account.repository');
const userRepository = require('../../users/repositories/user.repository');

test('completion uses the terminal done status from each workflow, regardless of the source column', async (t) => {
  const originals = [];
  const stub = (object, key, replacement) => {
    originals.push([object, key, object[key]]);
    object[key] = replacement;
  };
  t.after(() => originals.reverse().forEach(([object, key, value]) => { object[key] = value; }));

  const projectId = '507f1f77bcf86cd799439012';
  const workflowId = '507f1f77bcf86cd799439013';
  const accountId = '507f1f77bcf86cd799439011';
  const doneId = '507f1f77bcf86cd799439019';
  const activeIds = ['507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015', '507f1f77bcf86cd799439016', '507f1f77bcf86cd799439017'];
  let currentTask;
  let lastUpdate;

  stub(taskRepository, 'findById', async () => currentTask);
  stub(taskRepository, 'findMaxOrder', async (project, status) => {
    assert.equal(project, projectId);
    assert.equal(status, doneId);
    return { workflowOrder: 1000 };
  });
  stub(taskRepository, 'updateTask', async (_id, changes) => {
    lastUpdate = changes;
    return { ...currentTask, ...changes };
  });
  stub(taskWorkflowStatusRepository, 'listByWorkflowId', async () => [
    ...activeIds.map((_id, index) => ({ _id, category: index ? 'active' : 'not_started', isTerminal: false })),
    { _id: doneId, category: 'done', isTerminal: true },
  ]);
  stub(taskAccessService, 'assertProjectExists', async () => ({ _id: projectId, name: 'Assigned project', code: 'PRJ' }));
  stub(taskActivityService, 'logTaskActivity', async () => {});
  stub(taskNotificationPolicy, 'lifecycle', async () => {});
  stub(accountRepository, 'findById', async () => ({ _id: accountId, email: 'actor@example.com' }));
  stub(userRepository, 'findByAccountId', async () => null);

  for (const sourceId of activeIds) {
    currentTask = {
      _id: '507f1f77bcf86cd799439018', projectId, workflowId,
      workflowStatusId: sourceId, workflowOrder: 100, status: 'active',
      title: 'Task', priority: 'medium', assignees: [],
    };
    const result = await taskBoardService.completeTask(currentTask._id, accountId, { taskSystem: true });
    assert.equal(lastUpdate.workflowStatusId, doneId);
    assert.ok(lastUpdate.workflowOrder > 1000);
    assert.equal(lastUpdate.status, 'completed');
    assert.equal(result.workflowStatusId, doneId);
    assert.equal(result.status, 'completed');
  }
});

test('completion leaves a task untouched when its workflow has no terminal done status', async (t) => {
  const originalFind = taskRepository.findById;
  const originalUpdate = taskRepository.updateTask;
  const originalStatuses = taskWorkflowStatusRepository.listByWorkflowId;
  t.after(() => {
    taskRepository.findById = originalFind;
    taskRepository.updateTask = originalUpdate;
    taskWorkflowStatusRepository.listByWorkflowId = originalStatuses;
  });
  taskRepository.findById = async () => ({
    _id: '507f1f77bcf86cd799439018', projectId: '507f1f77bcf86cd799439012',
    workflowId: '507f1f77bcf86cd799439013', status: 'active',
  });
  taskWorkflowStatusRepository.listByWorkflowId = async () => [
    { _id: '507f1f77bcf86cd799439014', category: 'active', isTerminal: false },
  ];
  let updated = false;
  taskRepository.updateTask = async () => { updated = true; };
  await assert.rejects(
    taskBoardService.completeTask('507f1f77bcf86cd799439018', '507f1f77bcf86cd799439011', { taskSystem: true }),
    { status: 409 },
  );
  assert.equal(updated, false);
});
