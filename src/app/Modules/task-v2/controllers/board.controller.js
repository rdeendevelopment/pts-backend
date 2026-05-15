const boardService = require('../services/board.service');
const adminService = require('../services/admin.service');
const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');

function actor(req) {
  return req.auth?.user?._id || req.user?._id;
}
function isAdmin(req) {
  return req.auth?.accountType === 'admin';
}
function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function publicErrorMessage(err) {
  if (!err) return 'Server error';
  if (err.name === 'CastError') return 'Invalid identifier';
  if (err.name === 'ValidationError') return 'Invalid data';
  return err.message || 'Server error';
}

function fail(res, err) {
  const status = err.status || 500;
  const message = publicErrorMessage(err);
  if (status >= 500) {
    logger.error(err.message || 'Unhandled error', {
      stack: err.stack,
      name: err.name,
    });
  }
  return res.status(status).json({ success: false, message });
}

// GET /api/task-v2/projects
async function getProjects(req, res) {
  try {
    const scope = req.query.scope;
    const data = await boardService.getProjects(actor(req), isAdmin(req), { scope });
    ok(res, data);
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/projects/:projectId/board
async function getBoard(req, res) {
  try {
    const filters = {
      assigneeUserId: req.query.assigneeUserId,
      priority:       req.query.priority,
    };
    const data = await boardService.getProjectBoard(req.params.projectId, actor(req), isAdmin(req), filters);
    ok(res, data);
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/projects/:projectId/workflow
async function getWorkflow(req, res) {
  try {
    await boardService.assertProjectWorkflowReadable(req.params.projectId, actor(req), isAdmin(req));
    const { getOrCreateProjectWorkflow } = require('../services/workflow.service');
    const data = await getOrCreateProjectWorkflow(req.params.projectId);
    ok(res, data);
  } catch (e) { fail(res, e); }
}

// POST /api/task-v2/projects/:projectId/tasks
async function createTask(req, res) {
  try {
    const task = await boardService.createTask(req.params.projectId, actor(req), isAdmin(req), req.body);
    ok(res, task, 201);
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/tasks/:taskId
async function getTask(req, res) {
  try {
    const task = await boardService.getTask(req.params.taskId, actor(req), isAdmin(req));
    ok(res, task);
  } catch (e) { fail(res, e); }
}

// PUT /api/task-v2/tasks/:taskId
async function updateTask(req, res) {
  try {
    const task = await boardService.updateTask(req.params.taskId, actor(req), isAdmin(req), req.body);
    ok(res, task);
  } catch (e) { fail(res, e); }
}

// PUT /api/task-v2/tasks/:taskId/move
async function moveTask(req, res) {
  try {
    const { statusId } = req.body;
    const task = await boardService.moveTask(req.params.taskId, statusId, actor(req), isAdmin(req));
    ok(res, task);
  } catch (e) { fail(res, e); }
}

// PUT /api/task-v2/tasks/:taskId/complete
async function completeTask(req, res) {
  try {
    const task = await boardService.completeTask(req.params.taskId, actor(req), isAdmin(req));
    ok(res, task);
  } catch (e) { fail(res, e); }
}

// DELETE /api/task-v2/tasks/:taskId  (archive)
async function archiveTask(req, res) {
  try {
    const task = await boardService.archiveTask(req.params.taskId, actor(req), isAdmin(req));
    ok(res, task);
  } catch (e) { fail(res, e); }
}

// PUT /api/task-v2/tasks/:taskId/restore
async function restoreTask(req, res) {
  try {
    const task = await boardService.restoreTask(req.params.taskId, actor(req), isAdmin(req));
    ok(res, task);
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/projects/:projectId/archived-tasks
async function listArchivedTasks(req, res) {
  try {
    const data = await boardService.listArchivedTasks(req.params.projectId, actor(req), isAdmin(req));
    ok(res, data);
  } catch (e) { fail(res, e); }
}

// DELETE /api/task-v2/tasks/:taskId/permanent  (hard delete — archived tasks only)
async function permanentDeleteTask(req, res) {
  try {
    const data = await boardService.permanentDeleteTask(req.params.taskId, actor(req), isAdmin(req));
    ok(res, data);
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/tasks/:taskId/comments
async function getComments(req, res) {
  try {
    const data = await boardService.getComments(req.params.taskId, actor(req), isAdmin(req));
    ok(res, data);
  } catch (e) { fail(res, e); }
}

// POST /api/task-v2/tasks/:taskId/comments
async function addComment(req, res) {
  try {
    const comment = await boardService.addComment(req.params.taskId, actor(req), isAdmin(req), req.body);
    ok(res, comment, 201);
  } catch (e) { fail(res, e); }
}

async function uploadTaskAttachment(req, res) {
  try {
    const file = req.files?.file;
    const row = await boardService.uploadTaskAttachment(req.params.taskId, actor(req), isAdmin(req), file);
    ok(res, row, 201);
  } catch (e) { fail(res, e); }
}

async function uploadTaskCommentFile(req, res) {
  try {
    const file = req.files?.file;
    const data = await boardService.uploadTaskCommentFile(req.params.taskId, actor(req), isAdmin(req), file);
    ok(res, data, 201);
  } catch (e) { fail(res, e); }
}

async function deleteTaskAttachment(req, res) {
  try {
    ok(res, await boardService.deleteTaskAttachment(req.params.taskId, req.params.attachmentId, actor(req), isAdmin(req)));
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/inbox
async function getInbox(req, res) {
  try {
    ok(res, await boardService.getInbox(actor(req), isAdmin(req)));
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/notifications
async function listNotifications(req, res) {
  try {
    const lim = req.query.limit != null ? Number(req.query.limit) : 50;
    ok(res, await notificationService.listNotifications(actor(req), lim));
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/notifications/unread-count
async function getNotificationUnreadCount(req, res) {
  try {
    ok(res, await notificationService.unreadCount(actor(req)));
  } catch (e) { fail(res, e); }
}

// PATCH /api/task-v2/notifications/:id/read
async function markNotificationRead(req, res) {
  try {
    ok(res, await notificationService.markRead(req.params.id, actor(req)));
  } catch (e) { fail(res, e); }
}

// POST /api/task-v2/notifications/read-all
async function markAllNotificationsRead(req, res) {
  try {
    ok(res, await notificationService.markAllRead(actor(req)));
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/my-tasks
async function getMyTasks(req, res) {
  try {
    ok(res, await boardService.getMyTasks(actor(req), isAdmin(req)));
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/mentions
async function getMentions(req, res) {
  try {
    ok(res, await boardService.getMentions(actor(req), isAdmin(req)));
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/activity
async function getActivity(req, res) {
  try {
    ok(res, await boardService.getActivityFeed(actor(req), isAdmin(req)));
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/calendar
async function getCalendar(req, res) {
  try {
    ok(res, await boardService.getCalendar(actor(req), isAdmin(req)));
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/reports
async function getReports(req, res) {
  try {
    ok(res, await boardService.getReports(actor(req), isAdmin(req), req.query.projectId));
  } catch (e) { fail(res, e); }
}

// GET /api/task-v2/reports/workload
async function getWorkload(req, res) {
  try { ok(res, await boardService.getWorkload(actor(req), isAdmin(req))); }
  catch (e) { fail(res, e); }
}

// GET /api/task-v2/reports/project-health
async function getProjectHealth(req, res) {
  try { ok(res, await boardService.getProjectHealth(actor(req), isAdmin(req))); }
  catch (e) { fail(res, e); }
}

// GET /api/task-v2/activity/summary
async function getActivitySummary(req, res) {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    ok(res, await boardService.getActivitySummary());
  }
  catch (e) { fail(res, e); }
}

// ── Phase 6 — Project Settings ────────────────────────────────────────────────

async function getProjectSettings(req, res) {
  try { ok(res, await adminService.getProjectSettings(req.params.projectId, actor(req), isAdmin(req))); }
  catch (e) { fail(res, e); }
}

async function updateProjectSettings(req, res) {
  try { ok(res, await adminService.updateProjectSettings(req.params.projectId, actor(req), isAdmin(req), req.body)); }
  catch (e) { fail(res, e); }
}

// ── Phase 6 — Workflow Status Management ─────────────────────────────────────

async function addWorkflowStatus(req, res) {
  try { ok(res, await adminService.addWorkflowStatus(req.params.projectId, actor(req), isAdmin(req), req.body), 201); }
  catch (e) { fail(res, e); }
}

async function updateWorkflowStatus(req, res) {
  try { ok(res, await adminService.updateWorkflowStatus(req.params.projectId, req.params.statusId, actor(req), isAdmin(req), req.body)); }
  catch (e) { fail(res, e); }
}

async function reorderWorkflowStatuses(req, res) {
  try { ok(res, await adminService.reorderWorkflowStatuses(req.params.projectId, actor(req), isAdmin(req), req.body.updates)); }
  catch (e) { fail(res, e); }
}

async function archiveWorkflowStatus(req, res) {
  try { ok(res, await adminService.archiveWorkflowStatus(req.params.projectId, req.params.statusId, actor(req), isAdmin(req), req.body.replacementStatusId)); }
  catch (e) { fail(res, e); }
}

// ── Phase 6 — Member Management ──────────────────────────────────────────────

async function getProjectMembers(req, res) {
  try { ok(res, await adminService.getProjectMembers(req.params.projectId, actor(req), isAdmin(req))); }
  catch (e) { fail(res, e); }
}

async function addProjectMember(req, res) {
  try { ok(res, await adminService.addProjectMember(req.params.projectId, actor(req), isAdmin(req), req.body), 201); }
  catch (e) { fail(res, e); }
}

async function updateProjectMember(req, res) {
  try { ok(res, await adminService.updateProjectMember(req.params.projectId, req.params.memberId, actor(req), isAdmin(req), req.body)); }
  catch (e) { fail(res, e); }
}

async function removeProjectMember(req, res) {
  try { ok(res, await adminService.removeProjectMember(req.params.projectId, req.params.memberId, actor(req), isAdmin(req))); }
  catch (e) { fail(res, e); }
}

// ── Phase 6 — Collaborators ───────────────────────────────────────────────────

async function getCollaborators(req, res) {
  try { ok(res, await adminService.getCollaborators(req.params.taskId, actor(req), isAdmin(req))); }
  catch (e) { fail(res, e); }
}

async function addCollaborator(req, res) {
  try { ok(res, await adminService.addCollaborator(req.params.taskId, actor(req), isAdmin(req), req.body), 201); }
  catch (e) { fail(res, e); }
}

async function removeCollaborator(req, res) {
  try { ok(res, await adminService.removeCollaborator(req.params.taskId, req.params.userId, actor(req), isAdmin(req))); }
  catch (e) { fail(res, e); }
}

module.exports = {
  getProjects, getBoard, getWorkflow,
  createTask, getTask, updateTask, moveTask, completeTask, archiveTask, restoreTask, permanentDeleteTask,
  listArchivedTasks,
  getComments, addComment,
  uploadTaskAttachment, uploadTaskCommentFile, deleteTaskAttachment,
  listNotifications, getNotificationUnreadCount, markNotificationRead, markAllNotificationsRead,
  getInbox, getMyTasks, getMentions, getActivity, getCalendar, getReports,
  getWorkload, getProjectHealth, getActivitySummary,
  // Phase 6
  getProjectSettings, updateProjectSettings,
  addWorkflowStatus, updateWorkflowStatus, reorderWorkflowStatuses, archiveWorkflowStatus,
  getProjectMembers, addProjectMember, updateProjectMember, removeProjectMember,
  getCollaborators, addCollaborator, removeCollaborator,
};
