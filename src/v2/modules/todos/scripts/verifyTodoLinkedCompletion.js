const assert = require('node:assert/strict');
const { connectV2Database, closeV2Database } = require('../../../database/connection');
const { getAccountModel } = require('../../auth/models/account.model');
const { getAccountRoleModel } = require('../../rbac/models/accountRole.model');
const { getTaskModel } = require('../../tasks/models/task.model');
const { getTaskWorkflowModel } = require('../../tasks/models/taskWorkflow.model');
const { getTaskWorkflowStatusModel } = require('../../tasks/models/taskWorkflowStatus.model');
const { getTaskActivityModel } = require('../../tasks/models/taskActivity.model');
const { getTaskNotificationModel } = require('../../tasks/models/taskNotification.model');
const { getTodoModel } = require('../models/todo.model');
const tokenService = require('../../auth/services/token.service');
const { request, shiftedDay } = require('./verifyTodoHistoryScenario');

async function findFixtureContext({ Todo, Account, AccountRole, Task }) {
  const links = await Todo.find({ linkedTaskId: { $ne: null }, projectId: { $ne: null }, isDeleted: false }).lean();
  for (const link of links) {
    const [account, role, task] = await Promise.all([
      Account.findOne({ _id: link.createdBy, status: 'active', isDeleted: false, accountType: { $ne: 'client' } }).lean(),
      AccountRole.exists({ accountId: link.createdBy, status: 'active', isDeleted: false }),
      Task.findOne({ _id: link.linkedTaskId, status: 'active', isDeleted: false }).lean(),
    ]);
    if (!account || !role || !task) continue;
    const token = tokenService.signAccessToken(account, []);
    try {
      const dto = await request(token, `/tasks/tasks/${task._id}`);
      if (dto?.capabilities?.canComplete || dto?.capabilities?.canEdit || dto?.capabilities?.canMove) {
        return { account, token, task, drawerTask: dto };
      }
    } catch (_error) { /* try another existing linked owner */ }
  }
  return null;
}

function todoPayload({ tag, suffix, task, account, day }) {
  const now = new Date();
  return {
    title: `${tag} ${suffix}`, notes: null, status: 'pending', priority: 'medium', priorityRank: 2,
    todoDate: day, firstPlannedDate: day, currentPlannedDate: day,
    planningHistory: [{ plannedDate: day, addedAt: now, source: 'added_from_task', statusAtDayEnd: 'pending' }],
    carryForwardCount: 0, sourceType: 'task', completionEvents: [], deadline: null, hasDeadline: false,
    reminderAt: null, projectId: task.projectId, projectName: '', linkedTaskId: task._id,
    createdBy: account._id, completedBy: null, completedAt: null, isDeleted: false,
  };
}

async function run() {
  if (!process.argv.includes('--run')) throw new Error('Pass --run to create and automatically clean up isolated linked-task fixtures.');
  const Account = getAccountModel();
  const AccountRole = getAccountRoleModel();
  const Task = getTaskModel();
  const Workflow = getTaskWorkflowModel();
  const WorkflowStatus = getTaskWorkflowStatusModel();
  const Activity = getTaskActivityModel();
  const Notification = getTaskNotificationModel();
  const Todo = getTodoModel();
  const context = await findFixtureContext({ Todo, Account, AccountRole, Task });
  assert(context, 'A readable/editable existing linked task owner is required for the connected verification');
  const { account, token, task: sourceTask, drawerTask } = context;
  const completedStatus = await WorkflowStatus.findOne({ workflowId: sourceTask.workflowId, category: 'done', isTerminal: true, status: 'active' }).lean();
  assert(completedStatus, 'The selected real workflow must have a terminal done status');
  const tag = `__todo_linked_verify_${Date.now()}__`;
  const todoIds = [];
  const taskIds = [];
  const workflowIds = [];
  const workflowStatusIds = [];
  const day = shiftedDay(0);

  const makeTask = async (suffix, overrides = {}) => {
    const created = await Task.create({
      projectId: sourceTask.projectId, workflowId: sourceTask.workflowId,
      workflowStatusId: sourceTask.workflowStatusId, workflowOrder: 999999,
      title: `${tag} ${suffix}`, description: '', priority: 'none', status: 'active',
      assignees: [], primaryAssigneeId: null, tags: [], checklist: [], attachments: [],
      createdBy: account._id, updatedBy: account._id, isDeleted: false, ...overrides,
    });
    taskIds.push(String(created._id));
    return created.toObject();
  };
  const makeTodo = async (suffix, linkedTask) => {
    const created = await Todo.create(todoPayload({ tag, suffix, task: linkedTask, account, day }));
    todoIds.push(String(created._id));
    return created.toObject();
  };

  try {
    assert.equal(String(drawerTask._id || drawerTask.id), String(sourceTask._id), 'linked task must load through the real Task API');

    const myDayOnlyTask = await makeTask('my-day-only task');
    const myDayOnlyTodo = await makeTodo('my-day-only todo', myDayOnlyTask);
    const myDayOnly = await request(token, `/todos/${myDayOnlyTodo._id}/complete`, { method: 'PATCH', body: JSON.stringify({ completionMode: 'my_day_only' }) });
    assert.equal(myDayOnly.status, 'completed');
    assert.equal((await Task.findById(myDayOnlyTask._id).lean()).status, 'active');

    const bothTask = await makeTask('both task');
    const bothTodo = await makeTodo('both todo', bothTask);
    const both = await request(token, `/todos/${bothTodo._id}/complete`, { method: 'PATCH', body: JSON.stringify({ completionMode: 'my_day_and_task' }) });
    assert.equal(both.status, 'completed');
    assert.equal(both.linkedTaskCompletionSucceeded, true);
    assert.equal((await Task.findById(bothTask._id).lean()).status, 'completed');

    const alreadyTask = await makeTask('already-completed task', {
      status: 'completed', workflowStatusId: completedStatus._id, completedAt: new Date(), completedBy: account._id,
    });
    const alreadyTodo = await makeTodo('already-completed todo', alreadyTask);
    const already = await request(token, `/todos/${alreadyTodo._id}/complete`, { method: 'PATCH', body: JSON.stringify({ completionMode: 'my_day_and_task' }) });
    assert.equal(already.status, 'completed');
    assert.equal(already.linkedTaskCompletionSucceeded, true);

    const noDoneWorkflow = await Workflow.create({ projectId: sourceTask.projectId, name: `${tag} no done`, isDefault: false, status: 'active' });
    workflowIds.push(String(noDoneWorkflow._id));
    const onlyStatus = await WorkflowStatus.create({
      workflowId: noDoneWorkflow._id, projectId: sourceTask.projectId, name: 'Active', key: `${tag.toLowerCase()}-active`,
      order: 1, category: 'active', isTerminal: false, status: 'active',
    });
    workflowStatusIds.push(String(onlyStatus._id));
    const blockedTask = await makeTask('cannot-transition task', { workflowId: noDoneWorkflow._id, workflowStatusId: onlyStatus._id });
    const blockedTodo = await makeTodo('cannot-transition todo', blockedTask);
    let blockedError = null;
    try {
      await request(token, `/todos/${blockedTodo._id}/complete`, { method: 'PATCH', body: JSON.stringify({ completionMode: 'my_day_and_task' }) });
    } catch (error) { blockedError = error; }
    assert(blockedError, 'a workflow without a done status must reject linked completion');
    assert.equal((await Todo.findById(blockedTodo._id).lean()).status, 'pending');
    assert.equal((await Task.findById(blockedTask._id).lean()).status, 'active');

    const result = {
      taskDrawerReadPassed: true, myDayOnlyPassed: true, myDayAndTaskPassed: true,
      alreadyCompletedTaskPassed: true, cannotTransitionRollbackPassed: true,
    };
    console.info('[todo-linked-completion-verification] passed', result);
    return result;
  } finally {
    if (todoIds.length) await Todo.deleteMany({ _id: { $in: todoIds }, title: { $regex: `^${tag}` } });
    if (taskIds.length) {
      await Notification.deleteMany({ taskId: { $in: taskIds } });
      await Activity.deleteMany({ taskId: { $in: taskIds } });
      await Task.deleteMany({ _id: { $in: taskIds }, title: { $regex: `^${tag}` } });
    }
    if (workflowStatusIds.length) await WorkflowStatus.deleteMany({ _id: { $in: workflowStatusIds } });
    if (workflowIds.length) await Workflow.deleteMany({ _id: { $in: workflowIds }, name: { $regex: `^${tag}` } });
    console.info('[todo-linked-completion-verification] temporary fixtures removed', { todos: todoIds.length, tasks: taskIds.length });
  }
}

if (require.main === module) {
  connectV2Database()
    .then(run)
    .then(() => closeV2Database())
    .catch(async (error) => { console.error(error); await closeV2Database(); process.exitCode = 1; });
}

module.exports = { findFixtureContext, todoPayload, run };
