const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { isSuperAdmin } = require('../../rbac/helpers/authorize.helper');
const { assertCanAccessProjectForTasks } = require('../../tasks/services/taskAccess.service');
const taskRepository = require('../../tasks/repositories/task.repository');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const { resolveUserIdFromAuth } = require('../../tasks/helpers/taskAccessScope.helper');
const repository = require('../repositories/todo.repository');

const priorities = ['high', 'medium', 'low'];
const statuses = ['pending', 'completed', 'overdue'];
const sorts = ['priority', 'deadline', 'newest', 'oldest', 'project'];
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const priorityRank = { high: 1, medium: 2, low: 3 };

function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

function toDto(todo, accessibleProjectIds = null) {
  if (!todo) return null;
  const project = todo.projectId && typeof todo.projectId === 'object' ? todo.projectId : null;
  const task = todo.linkedTaskId && typeof todo.linkedTaskId === 'object' ? todo.linkedTaskId : null;
  const creator = todo.createdBy && typeof todo.createdBy === 'object' ? todo.createdBy : null;
  const projectId = project ? String(project._id) : (todo.projectId ? String(todo.projectId) : null);
  const projectAccessible = !projectId || accessibleProjectIds === null || accessibleProjectIds.has(projectId);
  const projectAvailable = Boolean(project && !project.isDeleted && projectAccessible);
  return {
    id: String(todo._id), title: todo.title, notes: todo.notes, status: todo.status,
    priority: todo.priority, todoDate: todo.todoDate,
    deadline: todo.deadline?.toISOString?.() || todo.deadline || null,
    reminderAt: todo.reminderAt?.toISOString?.() || todo.reminderAt || null,
    projectId,
    project: projectAvailable ? { id: String(project._id), name: project.name, code: project.code || null } : null,
    projectUnavailable: Boolean(projectId && !projectAvailable),
    linkedTaskId: task ? String(task._id) : (todo.linkedTaskId ? String(todo.linkedTaskId) : null),
    linkedTask: task && !task.isDeleted && projectAccessible ? { id: String(task._id), title: task.title } : null,
    linkedTaskUnavailable: Boolean(todo.linkedTaskId && (!task || task.isDeleted || !projectAccessible)),
    creator: creator ? { id: String(creator._id), name: [creator.firstName, creator.lastName].filter(Boolean).join(' ') || creator.email } : null,
    completedBy: todo.completedBy ? String(todo.completedBy) : null,
    completedAt: todo.completedAt?.toISOString?.() || todo.completedAt || null,
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

async function visibleDto(req, todo) {
  return toDto(todo, await accessibleProjectIds(req));
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
  return visibleDto(req, await repository.create({
    title, notes: payload.notes ? String(payload.notes).trim() : null, status: 'pending', priority, priorityRank: priorityRank[priority],
    todoDate, deadline: parseDate(payload.deadline, 'deadline') ?? null, hasDeadline: Boolean(payload.deadline),
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
  const result = await repository.list(filters, { page, limit, sort });
  const accessible = await accessibleProjectIds(req);
  return { items: result.items.map((todo) => toDto(todo, accessible)), pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) } };
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
    updates.todoDate = payload.todoDate;
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
  }
  return visibleDto(req, await repository.update(existing._id, req.v2Auth.accountId, updates));
}

async function setCompletion(req, id, completed) {
  const existing = await getOwned(req, id);
  return visibleDto(req, await repository.update(existing._id, req.v2Auth.accountId, completed
    ? { status: 'completed', completedAt: new Date(), completedBy: req.v2Auth.accountId }
    : { status: 'pending', completedAt: null, completedBy: null }));
}

async function remove(req, id) {
  const existing = await getOwned(req, id);
  await repository.softDelete(existing._id, req.v2Auth.accountId);
  return { deleted: true, id: String(existing._id) };
}

async function moveToToday(req, id, mode = 'move') {
  const existing = await getOwned(req, id);
  if (existing.status !== 'pending') fail('Only pending todos can be moved or copied');
  if (mode === 'copy') return create(req, { ...toDto(existing), todoDate: todayKey() });
  return visibleDto(req, await repository.update(existing._id, req.v2Auth.accountId, { todoDate: todayKey() }));
}

async function summary(req, query = {}) {
  const result = await repository.summary(listScope(req, query));
  return { ...result, completionPercentage: result.total ? Math.round((result.completed / result.total) * 100) : 0 };
}

module.exports = { todayKey, cleanTitle, listScope, toDto, create, list, get, update, complete: (req, id) => setCompletion(req, id, true), reopen: (req, id) => setCompletion(req, id, false), remove, moveToToday, summary };
