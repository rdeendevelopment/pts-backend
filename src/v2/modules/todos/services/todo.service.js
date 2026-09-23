const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { isSuperAdmin } = require('../../rbac/helpers/authorize.helper');
const { assertCanAccessProjectForTasks } = require('../../tasks/services/taskAccess.service');
const taskRepository = require('../../tasks/repositories/task.repository');
const taskBoardService = require('../../tasks/services/taskBoard.service');
const taskWorkService = require('../../tasks/services/taskWork.service');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const { resolveUserIdFromAuth } = require('../../tasks/helpers/taskAccessScope.helper');
const { formatDayKey, getBusinessTimezone } = require('../../activity/helpers/week.helper');
const { daysBetween, planningEntries, outcomeForDay, isOutstandingOnDate, buildReport, reportRange } = require('../helpers/todoHistory.helper');
const repository = require('../repositories/todo.repository');

const priorities = ['high', 'medium', 'low'];
const statuses = ['pending', 'completed', 'overdue'];
const sorts = ['priority', 'deadline', 'newest', 'oldest', 'project'];
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const priorityRank = { high: 1, medium: 2, low: 3 };

function todayKey(now = new Date()) {
  return formatDayKey(now, getBusinessTimezone());
}

function fail(message, status = 400, fields) {
  throw new AppError(message, { status, code: status === 404 ? 'TODO_NOT_FOUND' : 'TODO_INVALID', fields });
}

function cleanTitle(value) {
  const title = String(value || '').trim();
  if (!title) fail('Todo title is required', 400, { title: 'title is required' });
  return title;
}

function parseDate(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(`${field} must be a valid date`, 400, { [field]: 'invalid date' });
  return date;
}

function toDto(todo, accessibleProjectIds = null, selectedDate = null) {
  if (!todo) return null;
  const project = todo.projectId && typeof todo.projectId === 'object' ? todo.projectId : null;
  const task = todo.linkedTaskId && typeof todo.linkedTaskId === 'object' ? todo.linkedTaskId : null;
  const creator = todo.createdBy && typeof todo.createdBy === 'object' ? todo.createdBy : null;
  const projectId = project ? String(project._id) : (todo.projectId ? String(todo.projectId) : null);
  const projectAccessible = !projectId || accessibleProjectIds === null || accessibleProjectIds.has(projectId);
  const projectAvailable = Boolean(project && !project.isDeleted && projectAccessible);
  const linkedTaskAvailable = Boolean(task && !task.isDeleted && task.status !== 'archived' && projectAccessible);
  const currentPlannedDate = todo.currentPlannedDate || todo.todoDate;
  const firstPlannedDate = todo.firstPlannedDate || todo.todoDate;
  const comparisonDate = selectedDate || todayKey();
  const workflowStatus = task?.workflowStatusId && typeof task.workflowStatusId === 'object' ? task.workflowStatusId : null;
  const taskDeadline = task?.dueDate?.toISOString?.() || task?.dueDate || null;
  const dayOutcome = outcomeForDay(todo, comparisonDate);
  const displayStatus = selectedDate && dayOutcome ? (dayOutcome.completedThisDay ? 'completed' : 'pending') : todo.status;
  const history = planningEntries(todo);
  const lastMove = [...history].reverse().find((entry) => entry.movedAt);
  return {
    id: String(todo._id), title: todo.title, notes: todo.notes, status: displayStatus,
    priority: todo.priority, todoDate: currentPlannedDate,
    firstPlannedDate, currentPlannedDate,
    planningHistory: history, carryForwardCount: Number(todo.carryForwardCount || 0),
    lastCarriedForwardAt: lastMove?.movedAt?.toISOString?.() || lastMove?.movedAt || null,
    sourceType: todo.sourceType || (todo.linkedTaskId ? 'task' : 'personal'),
    deadline: todo.deadline?.toISOString?.() || todo.deadline || null,
    reminderAt: todo.reminderAt?.toISOString?.() || todo.reminderAt || null,
    projectId,
    project: projectAvailable ? { id: String(project._id), name: project.name, code: project.code || null } : null,
    projectUnavailable: Boolean(projectId && !projectAvailable),
    linkedTaskId: linkedTaskAvailable ? String(task._id) : null,
    linkedTask: linkedTaskAvailable ? {
      id: String(task._id), title: task.title, status: task.status,
      workflowStatus: workflowStatus ? { id: String(workflowStatus._id), name: workflowStatus.name, color: workflowStatus.color || null } : null,
      deadline: taskDeadline,
    } : null,
    linkedTaskUnavailable: Boolean(todo.linkedTaskId && !linkedTaskAvailable),
    linkedTaskAlreadyCompleted: Boolean(linkedTaskAvailable && task.status === 'completed'),
    creator: creator ? { id: String(creator._id), name: [creator.firstName, creator.lastName].filter(Boolean).join(' ') || creator.email } : null,
    completedBy: todo.completedBy ? String(todo.completedBy) : null,
    completedAt: todo.completedAt?.toISOString?.() || todo.completedAt || null,
    planningOverdueDays: daysBetween(firstPlannedDate, comparisonDate),
    daysPending: daysBetween(firstPlannedDate, comparisonDate),
    taskOverdue: Boolean(linkedTaskAvailable && taskDeadline && task.status !== 'completed' && new Date(taskDeadline).getTime() < Date.now()),
    dayOutcome, historicalOutcome: dayOutcome, currentStatus: todo.status,
    linkedTaskCompletionRequested: Boolean(todo.linkedTaskCompletionRequested),
    linkedTaskCompletionSucceeded: Boolean(todo.linkedTaskCompletionSucceeded),
    linkedTaskCompletedAt: todo.linkedTaskCompletedAt?.toISOString?.() || todo.linkedTaskCompletedAt || null,
    createdAt: todo.createdAt?.toISOString?.() || todo.createdAt,
    updatedAt: todo.updatedAt?.toISOString?.() || todo.updatedAt,
  };
}

async function accessibleProjectIds(req) {
  if (isSuperAdmin(req.v2Auth)) return null;
  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const ids = await projectAssignmentRepository.listActiveProjectIdsByUserId(userId);
  return new Set(ids.map(String));
}

async function visibleDto(req, todo, selectedDate = null) {
  return toDto(todo, await accessibleProjectIds(req), selectedDate);
}

async function validateLinks(req, projectIdRaw, linkedTaskIdRaw) {
  const projectId = projectIdRaw ? assertObjectId(projectIdRaw, 'projectId') : null;
  const linkedTaskId = linkedTaskIdRaw ? assertObjectId(linkedTaskIdRaw, 'linkedTaskId') : null;
  if (linkedTaskId && !projectId) fail('A project is required when linking a task', 400, { linkedTaskId: 'select a project first' });
  const project = projectId ? await assertCanAccessProjectForTasks(req, projectId) : null;
  if (linkedTaskId) {
    const task = await taskRepository.findById(linkedTaskId, { projectId });
    if (!task) fail('Linked task was not found or is not accessible', 404);
  }
  return { projectId, linkedTaskId, projectName: project?.name || '' };
}

async function create(req, payload = {}) {
  const title = cleanTitle(payload.title);
  const { projectId, linkedTaskId, projectName } = await validateLinks(req, payload.projectId, payload.linkedTaskId);
  const todoDate = payload.todoDate || todayKey();
  if (!dayPattern.test(todoDate)) fail('todoDate must use YYYY-MM-DD');
  const priority = payload.priority || 'medium';
  if (!priorities.includes(priority)) fail('Invalid priority');
  const now = new Date();
  return visibleDto(req, await repository.create({
    title, notes: payload.notes ? String(payload.notes).trim() : null, status: 'pending', priority, priorityRank: priorityRank[priority],
    todoDate, firstPlannedDate: todoDate, currentPlannedDate: todoDate,
    planningHistory: [{ plannedDate: todoDate, addedAt: now, source: linkedTaskId ? 'added_from_task' : 'created', statusAtDayEnd: 'pending' }],
    carryForwardCount: 0, sourceType: linkedTaskId ? 'task' : 'personal',
    deadline: parseDate(payload.deadline, 'deadline') ?? null, hasDeadline: Boolean(payload.deadline),
    reminderAt: parseDate(payload.reminderAt, 'reminderAt') ?? null,
    projectId, projectName, linkedTaskId, createdBy: req.v2Auth.accountId,
  }));
}

function listScope(req, query = {}) {
  let createdBy = req.v2Auth.accountId;
  if (query.createdBy && query.createdBy !== 'me') {
    if (!isSuperAdmin(req.v2Auth)) fail('You cannot view another user\'s private todos', 403);
    createdBy = query.createdBy === 'all' ? undefined : assertObjectId(query.createdBy, 'createdBy');
  }
  const todoDate = query.date || query.todoDate || todayKey();
  if (!dayPattern.test(todoDate)) fail('date must use YYYY-MM-DD');
  if (query.status && !statuses.includes(query.status)) fail('Invalid status');
  if (query.priority && !priorities.includes(query.priority)) fail('Invalid priority');
  let projectId;
  if (query.projectId === 'personal') projectId = null;
  else if (query.projectId) projectId = assertObjectId(query.projectId, 'projectId');
  return { createdBy, todoDate, status: query.status, priority: query.priority, projectId };
}

async function list(req, query = {}) {
  const filters = listScope(req, query);
  if (filters.projectId) await assertCanAccessProjectForTasks(req, filters.projectId);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const sort = sorts.includes(query.sort) ? query.sort : 'newest';
  const [result, reportItems, outstandingCandidates] = await Promise.all([
    repository.list(filters, { page, limit, sort }),
    repository.listForReport(filters.createdBy, filters.todoDate, filters.todoDate),
    repository.listOutstandingOnDate(filters.createdBy, filters.todoDate),
  ]);
  const accessible = await accessibleProjectIds(req);
  const daily = buildReport(reportItems, filters.todoDate, filters.todoDate);
  const highPriority = reportItems.filter((todo) => todo.priority === 'high' && outcomeForDay(todo, filters.todoDate)?.statusAtDayEnd !== 'completed').length;
  return {
    items: result.items.map((todo) => toDto(todo, accessible, filters.todoDate)),
    pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
    summary: {
      total: daily.totalPlanned, completed: daily.completedWithinSameDay, pending: daily.pendingAtDayEnd,
      highPriority, completionPercentage: daily.completionPercentage,
      outstanding: outstandingCandidates.filter((todo) => isOutstandingOnDate(todo, filters.todoDate)).length,
      movedForward: daily.carriedOutOfPeriod, report: daily,
    },
  };
}

async function getOwned(req, id) {
  const todo = await repository.findById(assertObjectId(id, 'id'), req.v2Auth.accountId);
  if (!todo) fail('Todo not found', 404);
  return todo;
}

async function get(req, id) { return visibleDto(req, await getOwned(req, id)); }

async function update(req, id, payload = {}) {
  const existing = await getOwned(req, id);
  const updates = {};
  if (payload.title !== undefined) updates.title = cleanTitle(payload.title);
  if (payload.notes !== undefined) updates.notes = payload.notes ? String(payload.notes).trim() : null;
  if (payload.priority !== undefined) {
    if (!priorities.includes(payload.priority)) fail('Invalid priority');
    updates.priority = payload.priority;
    updates.priorityRank = priorityRank[payload.priority];
  }
  if (payload.todoDate !== undefined) {
    if (!dayPattern.test(payload.todoDate)) fail('todoDate must use YYYY-MM-DD');
    if (payload.todoDate !== (existing.currentPlannedDate || existing.todoDate)) fail('Planned dates can only be changed with the move action');
  }
  if (payload.deadline !== undefined) { updates.deadline = parseDate(payload.deadline, 'deadline'); updates.hasDeadline = Boolean(payload.deadline); }
  if (payload.reminderAt !== undefined) updates.reminderAt = parseDate(payload.reminderAt, 'reminderAt');
  if (payload.projectId !== undefined || payload.linkedTaskId !== undefined) {
    const clearingProject = payload.projectId === null || payload.projectId === '';
    const links = await validateLinks(req,
      payload.projectId === undefined ? existing.projectId?._id || existing.projectId : payload.projectId,
      clearingProject ? null : (payload.linkedTaskId === undefined ? existing.linkedTaskId?._id || existing.linkedTaskId : payload.linkedTaskId));
    updates.projectId = links.projectId;
    updates.projectName = links.projectName;
    updates.linkedTaskId = links.projectId ? links.linkedTaskId : null;
    updates.sourceType = updates.linkedTaskId ? 'task' : 'personal';
  }
  return visibleDto(req, await repository.update(existing._id, req.v2Auth.accountId, updates));
}

async function setCompletion(req, id, completed) {
  const existing = await getOwned(req, id);
  if (completed && existing.status === 'completed') return visibleDto(req, existing);
  if (!completed && existing.status === 'pending') return visibleDto(req, existing);
  const now = new Date();
  const plannedDate = existing.currentPlannedDate || existing.todoDate;
  const saved = completed
    ? await repository.complete(existing._id, req.v2Auth.accountId, { completedAt: now, completedBy: req.v2Auth.accountId, plannedDate: todayKey(now) })
    : await repository.reopen(existing._id, req.v2Auth.accountId, { reopenedAt: now, reopenedBy: req.v2Auth.accountId, plannedDate });
  return visibleDto(req, saved);
}

async function complete(req, id, completionMode = 'my_day_only') {
  const existing = await getOwned(req, id);
  if (existing.status === 'completed') return visibleDto(req, existing);
  if (completionMode !== 'my_day_and_task' || !existing.linkedTaskId) return setCompletion(req, id, true);

  const taskId = existing.linkedTaskId?._id || existing.linkedTaskId;
  const task = await taskRepository.findById(taskId);
  if (!task || task.status === 'archived') fail('Linked task is unavailable. Complete the My Day item only.', 409);
  const wasAlreadyCompleted = task.status === 'completed';
  let taskCompletedByRequest = false;
  try {
    if (!wasAlreadyCompleted) {
      await taskBoardService.completeTask(taskId, req.v2Auth.accountId, req);
      taskCompletedByRequest = true;
    }
    const completedAt = new Date();
    const updated = await repository.complete(existing._id, req.v2Auth.accountId, {
      completedAt, completedBy: req.v2Auth.accountId, plannedDate: todayKey(completedAt),
      extra: { linkedTaskCompletionRequested: true, linkedTaskCompletionSucceeded: true, linkedTaskCompletedAt: completedAt },
    });
    if (!updated) throw new Error('Todo completion was not persisted');
    return visibleDto(req, updated);
  } catch (error) {
    if (taskCompletedByRequest) {
      try { await taskBoardService.reopenTask(taskId, req.v2Auth.accountId, req); } catch (_rollbackError) { /* surfaced by original error */ }
    }
    throw error;
  }
}

async function remove(req, id) {
  const existing = await getOwned(req, id);
  await repository.softDelete(existing._id, req.v2Auth.accountId);
  return { deleted: true, id: String(existing._id) };
}

async function moveToToday(req, id) {
  const existing = await getOwned(req, id);
  if (existing.status !== 'pending') fail('Only pending todos can be moved or copied');
  const destination = todayKey();
  const fromDate = existing.currentPlannedDate || existing.todoDate;
  if (fromDate === destination) return visibleDto(req, existing, destination);
  if ((existing.planningHistory || []).some((entry) => entry.plannedDate === destination)) return visibleDto(req, existing, destination);
  const linkedTaskId = existing.linkedTaskId?._id || existing.linkedTaskId;
  if (linkedTaskId) {
    const duplicate = await repository.findActiveLinked(req.v2Auth.accountId, linkedTaskId, destination);
    if (duplicate && String(duplicate._id) !== String(existing._id)) {
      const merged = await repository.mergeCarryForward(existing, duplicate, req.v2Auth.accountId, { fromDate, toDate: destination, movedAt: new Date(), movedBy: req.v2Auth.accountId });
      return visibleDto(req, merged, destination);
    }
  }
  const moved = await repository.carryForward(existing._id, req.v2Auth.accountId, { fromDate, toDate: destination, movedAt: new Date(), movedBy: req.v2Auth.accountId });
  return visibleDto(req, moved, destination);
}

async function outstanding(req, query = {}) {
  const date = query.date || todayKey();
  if (!dayPattern.test(date)) fail('date must use YYYY-MM-DD');
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const candidates = await repository.listOutstandingOnDate(req.v2Auth.accountId, date);
  const outstandingItems = candidates.filter((todo) => isOutstandingOnDate(todo, date));
  const items = outstandingItems.slice((page - 1) * limit, page * limit);
  const accessible = await accessibleProjectIds(req);
  return { items: items.map((todo) => toDto(todo, accessible, date)), pagination: { page, limit, total: outstandingItems.length, pages: Math.ceil(outstandingItems.length / limit) } };
}

async function moveAllOutstanding(req, query = {}) {
  const date = todayKey();
  const items = await repository.listAllOutstanding(req.v2Auth.accountId, date);
  const moved = [];
  for (const item of items) moved.push(await moveToToday(req, String(item._id), 'move'));
  return { moved: moved.length, items: moved };
}

async function availableTasks(req, query = {}) {
  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const todoDate = query.date || todayKey();
  const result = await taskWorkService.listMyWork(req, { ...query, status: 'active', assigneeUserId: String(userId) });
  const items = await Promise.all(result.items.map(async (task) => ({
    ...task,
    alreadyAdded: Boolean(await repository.findActiveLinked(req.v2Auth.accountId, task.id || task._id, todoDate)),
  })));
  return { ...result, items };
}

async function addTasks(req, payload = {}) {
  const todoDate = payload.todoDate || todayKey();
  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const results = [];
  for (const rawId of [...new Set(payload.taskIds || [])]) {
    const taskId = assertObjectId(rawId, 'taskId');
    const task = await taskRepository.findById(taskId);
    if (!task || task.status !== 'active') fail('Task is unavailable or already completed', 409);
    const assigned = String(task.primaryAssigneeId || '') === String(userId)
      || (task.assignees || []).some((assignee) => String(assignee.userId) === String(userId));
    if (!assigned) fail('Only assigned tasks can be added to My Day', 403);
    const project = await assertCanAccessProjectForTasks(req, task.projectId);
    const priority = priorities.includes(task.priority) ? task.priority : (task.priority === 'urgent' ? 'high' : 'medium');
    const now = new Date();
    const todo = await repository.upsertLinked({
      title: task.title, notes: task.description || null, status: 'pending', priority, priorityRank: priorityRank[priority],
      todoDate, firstPlannedDate: todoDate, currentPlannedDate: todoDate,
      planningHistory: [{ plannedDate: todoDate, addedAt: now, source: 'added_from_task', statusAtDayEnd: 'pending' }],
      carryForwardCount: 0, sourceType: 'task', deadline: task.dueDate || null, hasDeadline: Boolean(task.dueDate), reminderAt: null,
      projectId: task.projectId, projectName: project?.name || '', linkedTaskId: task._id, createdBy: req.v2Auth.accountId,
    });
    results.push(await visibleDto(req, todo));
  }
  return { items: results, added: results.length };
}

async function summary(req, query = {}) {
  const scope = listScope(req, query);
  const items = await repository.listForReport(scope.createdBy, scope.todoDate, scope.todoDate);
  const outstandingItems = (await repository.listOutstandingOnDate(scope.createdBy, scope.todoDate)).filter((todo) => isOutstandingOnDate(todo, scope.todoDate));
  const report = buildReport(items, scope.todoDate, scope.todoDate);
  return { total: report.totalPlanned, completed: report.completedWithinSameDay, pending: report.pendingAtDayEnd, outstanding: outstandingItems.length, highPriority: items.filter((todo) => todo.priority === 'high' && outcomeForDay(todo, scope.todoDate)?.statusAtDayEnd !== 'completed').length, completionPercentage: report.completionPercentage, movedForward: report.carriedOutOfPeriod, report };
}

async function report(req, query = {}) {
  const period = ['daily', 'weekly', 'monthly'].includes(query.period) ? query.period : 'daily';
  const anchorDate = query.date || todayKey();
  if (!dayPattern.test(anchorDate)) fail('date must use YYYY-MM-DD');
  const { startDate, endDate } = reportRange(period, anchorDate);
  const items = await repository.listForReport(req.v2Auth.accountId, startDate, endDate);
  return { period, ...buildReport(items, startDate, endDate) };
}

module.exports = { todayKey, cleanTitle, listScope, toDto, create, list, get, update, complete, reopen: (req, id) => setCompletion(req, id, false), remove, moveToToday, outstanding, moveAllOutstanding, availableTasks, addTasks, summary, report };
