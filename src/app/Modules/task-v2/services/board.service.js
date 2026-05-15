// board.service.js — V2 shared-workflow task operations.
// Uses tasksV2, taskWorkflowsV2, taskWorkflowStatusesV2 collections exclusively.
// Old legacy collections are never touched here.

const { CoreProject, CoreUser, AccountAdmin } = require('../../../MongoModels');
const {
  TaskV2,
  TaskWorkflowStatusV2,
  TaskCommentV2,
  TaskActivityV2,
  TaskCollaboratorV2,
  TaskNotificationV2,
} = require('../models');
const taskAccess = require('./task-access.service');
const notificationService = require('./notification.service');
const taskV2Files = require('./task-v2-file.service');
const { getOrCreateProjectWorkflow, getWorkflowForProject } = require('./workflow.service');
const { broadcastToV2Project, notifyV2User } = require('../sockets/task-v2.socket');

function err(msg, status = 400) {
  const e = new Error(msg); e.status = status; return e;
}

const EMPTY_REPORTS = {
  summary: { total: 0, active: 0, completed: 0, overdue: 0, inProgress: 0 },
  byStatus: [],
  byPriority: [],
  byProject: [],
  byAssignee: [],
};

function displayName(user) {
  if (!user) return '';
  if (user.name && String(user.name).trim()) return String(user.name).trim();
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (fullName) return fullName;
  if (user.userName && String(user.userName).trim()) return String(user.userName).trim();
  return user.email || '';
}

async function resolveUsersByIds(userIds = []) {
  const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return {};

  const [coreUsers, adminUsers] = await Promise.all([
    CoreUser.find({ _id: { $in: ids }, isDeleted: false }).select('firstName lastName userName email imageUrl').lean(),
    AccountAdmin.find({ _id: { $in: ids }, isDeleted: false }).select('name email imageUrl').lean(),
  ]);

  const map = {};
  for (const user of coreUsers) map[String(user._id)] = { ...user, __source: 'user' };
  for (const user of adminUsers) map[String(user._id)] = { ...user, __source: 'admin' };
  return map;
}

async function getActorDisplayName(actorId) {
  const map = await resolveUsersByIds([actorId]);
  return displayName(map[String(actorId)]);
}

async function enrichTaskUsers(task) {
  if (!task) return task;
  const assigneeIds = (task.assignees || []).map((a) => String(a.userId));
  const extraIds = [task.createdBy, task.reviewerId].filter(Boolean).map((id) => String(id));
  const userMap = await resolveUsersByIds([...assigneeIds, ...extraIds]);

  const assignees = (task.assignees || []).map((a) => {
    const user = userMap[String(a.userId)] || {};
    const name = a.name || displayName(user);
    const email = a.email || user.email || '';
    const avatarUrl = (user.imageUrl && String(user.imageUrl).trim()) || '';
    return { ...a, name, email, avatarUrl };
  });

  const createdByUser = userMap[String(task.createdBy)] || {};
  const reviewerUser = task.reviewerId ? (userMap[String(task.reviewerId)] || {}) : null;

  let out = {
    ...task,
    assignees,
    createdByName: displayName(createdByUser),
    createdByEmail: createdByUser.email || '',
    createdByAvatarUrl: (createdByUser.imageUrl && String(createdByUser.imageUrl).trim()) || '',
    reviewerName: reviewerUser ? displayName(reviewerUser) : '',
    reviewerAvatarUrl: reviewerUser && reviewerUser.imageUrl ? String(reviewerUser.imageUrl).trim() : '',
  };

  const atts = out.attachments || [];
  if (atts.length) {
    const upIds = [...new Set(atts.map((a) => String(a.uploadedBy)).filter(Boolean))];
    const upMap = await resolveUsersByIds(upIds);
    out = {
      ...out,
      attachments: atts.map((a) => ({
        ...a,
        uploadedByName: displayName(upMap[String(a.uploadedBy)]),
      })),
    };
  }

  return out;
}

// ── Access helpers ────────────────────────────────────────────────────────────

// CoreProject uses legacyId (not id) as the numeric project identifier.
function toProjectDoc(p) {
  return {
    id: Number(p.legacyId),
    title: p.title,
    name: p.title,
    status: p.status,
    isActive: p.isActive !== false,
    updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined,
  };
}

async function collaboratorTaskIdsForUser(actorId) {
  if (!actorId) return [];
  const ids = await TaskCollaboratorV2.distinct('taskId', { userId: actorId, isActive: true });
  return (ids || []).filter(Boolean);
}

// ── Projects list ─────────────────────────────────────────────────────────────

async function getProjects(actorId, isAdmin, filters = {}) {
  const scope = ['active', 'archived', 'all'].includes(filters.scope) ? filters.scope : 'active';
  const query = { isDeleted: false };
  if (scope === 'active') query.isActive = true;
  else if (scope === 'archived') query.isActive = false;

  if (isAdmin) {
    const projects = await CoreProject.find(query).select('legacyId title status isActive updatedAt').lean();
    return projects.map(toProjectDoc);
  }

  const sourceIds = [...await taskAccess.getAccessibleProjectSourceIds(actorId)];
  if (!sourceIds.length) return [];

  const projects = await CoreProject.find({
    legacyId: { $in: sourceIds },
    ...query,
  }).select('legacyId title status isActive updatedAt').lean();

  return projects.map(toProjectDoc);
}

// ── Board ─────────────────────────────────────────────────────────────────────

async function getProjectBoard(projectSourceId, actorId, isAdmin, filters = {}) {
  await taskAccess.assertProjectReadable(projectSourceId, actorId, isAdmin);

  const { workflow, statuses } = await getOrCreateProjectWorkflow(projectSourceId);
  const projectDoc = await CoreProject.findOne({ legacyId: Number(projectSourceId) }).select('title legacyId').lean();

  const taskQuery = {
    'projectRef.sourceId': Number(projectSourceId),
    status: { $ne: 'archived' },
  };
  if (filters.assigneeUserId) taskQuery['assignees.userId'] = filters.assigneeUserId;
  if (filters.priority)       taskQuery.priority = filters.priority;

  const tasks = await TaskV2.find(taskQuery)
    .sort({ workflowOrder: 1, createdAt: 1 })
    .lean();

  const board = {};
  for (const status of statuses) {
    board[String(status._id)] = [];
  }
  for (const task of tasks) {
    const key = String(task.workflowStatusId);
    if (board[key]) {
      board[key].push(task);
    } else {
      // Orphaned task — put in first status (Backlog)
      const first = String(statuses[0]?._id);
      if (first) (board[first] = board[first] || []).push(task);
    }
  }

  const project = { id: Number(projectSourceId), name: projectDoc?.title || '' };
  const enrichedBoard = {};
  for (const [statusId, list] of Object.entries(board)) {
    enrichedBoard[statusId] = await Promise.all(list.map((task) => enrichTaskUsers(task)));
  }

  const role = await taskAccess.getEffectiveProjectRole(Number(projectSourceId), actorId, isAdmin);
  const canEditTasks = isAdmin || (!!role && role !== 'viewer');

  return {
    workflow,
    statuses,
    board: enrichedBoard,
    project,
    capabilities: {
      canEditTasks,
      projectRole: role || undefined,
    },
  };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

async function createTask(projectSourceId, actorId, isAdmin, data) {
  await taskAccess.assertProjectReadable(projectSourceId, actorId, isAdmin);
  await taskAccess.assertCanEditTasksOnProject(projectSourceId, actorId, isAdmin);

  const { statuses } = await getOrCreateProjectWorkflow(projectSourceId);

  let statusId = data.statusId;
  if (!statusId) {
    // Default to Todo; fall back through Backlog then first available
    const todo = statuses.find((s) => s.name === 'Todo')
               || statuses.find((s) => s.name === 'Backlog')
               || statuses[0];
    statusId = todo?._id;
  }
  if (!statusId) throw err('No workflow statuses found for project');

  const maxOrderDoc = await TaskV2.findOne({
    'projectRef.sourceId': Number(projectSourceId),
    workflowStatusId: statusId,
  }).sort({ workflowOrder: -1 }).select('workflowOrder').lean();
  const nextOrder = (maxOrderDoc?.workflowOrder ?? 0) + 1024;

  // Auto-increment taskNumber per project
  const maxNumberDoc = await TaskV2.findOne({ 'projectRef.sourceId': Number(projectSourceId) })
    .sort({ taskNumber: -1 }).select('taskNumber').lean();
  const taskNumber = (maxNumberDoc?.taskNumber ?? 0) + 1;

  // Build assignee list — include explicit assignees + auto-assign the creator.
  const explicitIds = (data.assigneeIds || []).map((id) => String(id));
  const assigneeSet = new Set(explicitIds);
  assigneeSet.add(String(actorId));
  const allIds = [...assigneeSet];

  // Look up names so cards can show initials
  const userMap = await resolveUsersByIds(allIds);

  const assignees = allIds.map((id) => ({
    userId: id,
    assignedBy: actorId,
    name: displayName(userMap[id]),
    email: userMap[id]?.email || '',
  }));

  const task = await TaskV2.create({
    taskNumber,
    projectRef: { sourceId: Number(projectSourceId), sourceType: 'legacy' },
    workflowStatusId: statusId,
    workflowOrder: nextOrder,
    title:           data.title,
    description:     data.description || '',
    priority:        data.priority || 'none',
    tags:            data.tags || [],
    dueDate:         data.dueDate || null,
    startDate:       data.startDate || null,
    assignees,
    reviewerId:      data.reviewerId || null,
    labelIds:        data.labelIds || [],
    createdBy:       actorId,
  });

  const enriched = await enrichTaskUsers(task.toObject ? task.toObject() : task);
  await logActivity(task._id, projectSourceId, 'created', actorId);
  broadcastToV2Project(projectSourceId, 'created', { task: enriched });

  try {
    const actorName = await getActorDisplayName(actorId);
    await notificationService.notifyAssigneesOnCreate(enriched, actorId, actorName);
  } catch { /* non-critical */ }

  return enriched;
}

async function updateTask(taskId, actorId, isAdmin, data) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskMutationAllowed(task, actorId, isAdmin);

  let addedAssigneeIds = [];
  if (data.assigneeIds !== undefined) {
    const beforeIds = new Set((task.assignees || []).map((a) => String(a.userId)));
    const afterIds = (data.assigneeIds || []).map((id) => String(id));
    addedAssigneeIds = afterIds.filter((id) => !beforeIds.has(id));
  }

  const allowed = ['title', 'description', 'priority', 'tags', 'dueDate', 'startDate',
                   'labelIds', 'reviewerId', 'checklist', 'assigneeIds'];
  const patch = {};
  for (const key of allowed) {
    if (data[key] !== undefined) patch[key] = data[key];
  }

  if (data.assigneeIds !== undefined) {
    const userMap = await resolveUsersByIds(data.assigneeIds);
    patch.assignees = (data.assigneeIds || []).map((id) => ({
      userId: String(id),
      assignedBy: task.createdBy,
      name: displayName(userMap[String(id)]),
      email: userMap[String(id)]?.email || '',
    }));
    delete patch.assigneeIds;
  }

  const updated = await TaskV2.findByIdAndUpdate(taskId, { $set: patch }, { new: true }).lean();
  const enriched = await enrichTaskUsers(updated);
  await logActivity(taskId, task.projectRef?.sourceId, 'updated', actorId, patch);
  broadcastToV2Project(task.projectRef?.sourceId, 'updated', { task: enriched });

  try {
    if (addedAssigneeIds.length) {
      const actorName = await getActorDisplayName(actorId);
      await notificationService.notifyNewAssignees(enriched, addedAssigneeIds, actorId, actorName);
    }
  } catch { /* non-critical */ }

  return enriched;
}

async function moveTask(taskId, statusId, actorId, isAdmin) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskMoveAllowed(task, actorId, isAdmin);

  const targetStatus = await TaskWorkflowStatusV2.findById(statusId).lean();
  if (!targetStatus) throw err('Status not found', 404);

  const maxOrderDoc = await TaskV2.findOne({
    'projectRef.sourceId': task.projectRef.sourceId,
    workflowStatusId: statusId,
    _id: { $ne: task._id },
  }).sort({ workflowOrder: -1 }).select('workflowOrder').lean();
  const nextOrder = (maxOrderDoc?.workflowOrder ?? 0) + 1024;

  const patch = { workflowStatusId: statusId, workflowOrder: nextOrder };
  if (targetStatus.isTerminal && targetStatus.category === 'done') {
    patch.status = 'completed';
    patch.completedAt = new Date();
    patch.completedBy = actorId;
  } else if (task.status === 'completed' && !targetStatus.isTerminal) {
    patch.status = 'active';
    patch.completedAt = null;
    patch.completedBy = null;
  }

  const updated = await TaskV2.findByIdAndUpdate(taskId, { $set: patch }, { new: true }).lean();
  const enriched = await enrichTaskUsers(updated);
  await logActivity(taskId, task.projectRef?.sourceId, 'moved', actorId, { toStatusId: statusId, statusName: targetStatus.name });
  broadcastToV2Project(task.projectRef?.sourceId, 'moved', {
    taskId,
    fromStatusId: String(task.workflowStatusId),
    toStatusId:   String(statusId),
    task: enriched,
  });
  return enriched;
}

async function completeTask(taskId, actorId, isAdmin) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskMutationAllowed(task, actorId, isAdmin);

  const updated = await TaskV2.findByIdAndUpdate(taskId, {
    $set: { status: 'completed', completedAt: new Date(), completedBy: actorId },
  }, { new: true }).lean();
  const enriched = await enrichTaskUsers(updated);

  await logActivity(taskId, task.projectRef?.sourceId, 'completed', actorId);
  broadcastToV2Project(task.projectRef?.sourceId, 'updated', { task: enriched });
  return enriched;
}

async function archiveTask(taskId, actorId, isAdmin) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskArchiveAllowed(task, actorId, isAdmin);

  const updated = await TaskV2.findByIdAndUpdate(taskId, {
    $set: { status: 'archived', archivedAt: new Date() },
  }, { new: true }).lean();
  const enriched = await enrichTaskUsers(updated);

  await logActivity(taskId, task.projectRef?.sourceId, 'archived', actorId);
  broadcastToV2Project(task.projectRef?.sourceId, 'archived', {
    taskId: String(taskId),
    projectSourceId: Number(task.projectRef?.sourceId),
  });
  return enriched;
}

async function restoreTask(taskId, actorId, isAdmin) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertProjectReadable(task.projectRef?.sourceId, actorId, isAdmin);
  await taskAccess.assertCanEditTasksOnProject(task.projectRef?.sourceId, actorId, isAdmin);
  await taskAccess.assertTaskRestoreAllowed(task, actorId, isAdmin);

  const updated = await TaskV2.findByIdAndUpdate(taskId, {
    $set: { status: 'active', archivedAt: null },
  }, { new: true }).lean();
  const enriched = await enrichTaskUsers(updated);

  await logActivity(taskId, task.projectRef?.sourceId, 'restored', actorId);
  broadcastToV2Project(task.projectRef?.sourceId, 'restored', { task: enriched });
  return enriched;
}

/** Archived tasks for a project (recoverable). */
async function listArchivedTasks(projectSourceId, actorId, isAdmin) {
  await taskAccess.assertProjectReadable(projectSourceId, actorId, isAdmin);
  const rows = await TaskV2.find({
    'projectRef.sourceId': Number(projectSourceId),
    status: 'archived',
  })
    .sort({ archivedAt: -1, updatedAt: -1 })
    .limit(300)
    .lean();
  return Promise.all(rows.map((t) => enrichTaskUsers(t)));
}

/**
 * Permanent removal — only allowed for archived tasks; editors/admins only.
 */
async function permanentDeleteTask(taskId, actorId, isAdmin) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);
  if (task.status !== 'archived') {
    throw err('Only archived tasks can be permanently deleted. Archive the task first.', 400);
  }
  await taskAccess.assertTaskArchiveAllowed(task, actorId, isAdmin);

  const pid = Number(task.projectRef?.sourceId);
  const tid = String(taskId);

  await Promise.all([
    TaskCommentV2.deleteMany({ taskId }),
    TaskActivityV2.deleteMany({ taskId }),
    TaskCollaboratorV2.deleteMany({ taskId }),
    TaskNotificationV2.deleteMany({ taskId }),
  ]);
  await TaskV2.findByIdAndDelete(taskId);

  broadcastToV2Project(pid, 'deleted', {
    taskId: tid,
    projectSourceId: pid,
  });

  return { deleted: true, taskId: tid };
}

async function getTask(taskId, actorId, isAdmin) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskReadable(task, actorId, isAdmin);
  const enriched = await enrichTaskUsers(task);
  const capabilities = await taskAccess.getClientTaskCapabilities(task, actorId, isAdmin);
  return { ...enriched, capabilities };
}

function normalizeCommentAttachments(raw) {
  if (!Array.isArray(raw) || !raw.length) return [];
  const max = 10;
  const out = [];
  for (const item of raw.slice(0, max)) {
    if (!item || typeof item !== 'object') continue;
    const url = String(item.url || '').trim();
    if (!taskV2Files.isTaskV2UploadUrl(url)) continue;
    const name = String(item.name || 'file').slice(0, 500);
    const mimeType = String(item.mimeType || '').slice(0, 200);
    let size = Number(item.size);
    if (!Number.isFinite(size) || size < 0) size = 0;
    if (size > taskV2Files.MAX_SIZE_BYTES) size = taskV2Files.MAX_SIZE_BYTES;
    out.push({
      name,
      url: url.startsWith('/') ? url : `/${url}`,
      mimeType,
      size,
      storageProvider: 'local',
      publicId: null,
    });
  }
  return out;
}

async function uploadTaskAttachment(taskId, actorId, isPlatformAdmin, file) {
  const task = await TaskV2.findById(taskId).select('projectRef attachments status').lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskReadable(task, actorId, isPlatformAdmin);
  const caps = await taskAccess.getClientTaskCapabilities(task, actorId, isPlatformAdmin);
  if (!caps.canEdit) throw err('You do not have permission to add attachments', 403);

  if (!file) throw err('No file provided. Use field name "file".', 400);
  if (file.size > taskV2Files.MAX_SIZE_BYTES) {
    const mb = Math.round(taskV2Files.MAX_SIZE_BYTES / (1024 * 1024));
    throw err(`File too large. Maximum size is ${mb} MB.`, 413);
  }
  if (!taskV2Files.isAllowed(file.mimetype, file.name)) throw err('File type not allowed', 415);

  const meta = await taskV2Files.persistExpressFileUpload(file);
  const att = {
    name: meta.name,
    url: meta.url,
    mimeType: meta.mimeType,
    size: meta.size,
    uploadedBy: actorId,
    uploadedAt: new Date(),
  };

  const updated = await TaskV2.findByIdAndUpdate(
    taskId,
    { $push: { attachments: att } },
    { new: true },
  ).lean();

  const enriched = await enrichTaskUsers(updated);
  const list = enriched.attachments || [];
  return list[list.length - 1];
}

async function uploadTaskCommentFile(taskId, actorId, isPlatformAdmin, file) {
  const task = await TaskV2.findById(taskId).select('projectRef').lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskReadable(task, actorId, isPlatformAdmin);
  await taskAccess.assertTaskCommentAllowed(task, actorId, isPlatformAdmin);

  if (!file) throw err('No file provided. Use field name "file".', 400);
  if (file.size > taskV2Files.MAX_SIZE_BYTES) {
    const mb = Math.round(taskV2Files.MAX_SIZE_BYTES / (1024 * 1024));
    throw err(`File too large. Maximum size is ${mb} MB.`, 413);
  }
  if (!taskV2Files.isAllowed(file.mimetype, file.name)) throw err('File type not allowed', 415);

  const meta = await taskV2Files.persistExpressFileUpload(file);
  return {
    name: meta.name,
    url: meta.url,
    mimeType: meta.mimeType,
    size: meta.size,
    storageProvider: 'local',
    publicId: null,
  };
}

async function deleteTaskAttachment(taskId, attachmentId, actorId, isPlatformAdmin) {
  const task = await TaskV2.findById(taskId);
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskReadable(task, actorId, isPlatformAdmin);
  const caps = await taskAccess.getClientTaskCapabilities(task, actorId, isPlatformAdmin);
  if (!caps.canEdit) throw err('You do not have permission to delete attachments', 403);

  const sub = task.attachments.id(attachmentId);
  if (!sub) throw err('Attachment not found', 404);

  await taskV2Files.deletePhysicalFileByPublicUrl(sub.url);
  sub.deleteOne();
  await task.save();
  return { deleted: true, attachmentId: String(attachmentId) };
}

// ── Comments ──────────────────────────────────────────────────────────────────

async function getComments(taskId, actorId, isAdmin) {
  const task = await TaskV2.findById(taskId, 'projectRef').lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskReadable(task, actorId, isAdmin);

  const rows = await TaskCommentV2.find({ taskId, isDeleted: false })
    .sort({ createdAt: 1 })
    .lean();
  const userIds = [...new Set(rows.map((r) => String(r.userId)).filter(Boolean))];
  const userMap = await resolveUsersByIds(userIds);
  return rows.map((c) => {
    const u = userMap[String(c.userId)] || {};
    return {
      ...c,
      userDisplayName: displayName(u),
      userEmail: u.email || '',
      userAvatarUrl: (u.imageUrl && String(u.imageUrl).trim()) || '',
    };
  });
}

async function addComment(taskId, actorId, isAdmin, data) {
  const task = await TaskV2.findById(taskId).select('projectRef title projectId').lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskCommentAllowed(task, actorId, isAdmin);

  const attachments = normalizeCommentAttachments(data.attachments);
  const text = String(data.text || '').trim();
  if (!text.length && !attachments.length) {
    throw err('Comment text or at least one attachment is required', 400);
  }

  const comment = await TaskCommentV2.create({
    taskId,
    projectId: task.projectId || null,
    userId: actorId,
    parentCommentId: data.parentCommentId || null,
    text: text.length ? text : '(attachment)',
    mentions: Array.isArray(data.mentions) ? data.mentions : [],
    attachments,
  });

  await TaskV2.findByIdAndUpdate(taskId, { $inc: { commentCount: 1 } });

  const textSnippet = notificationService.snippet(text.length ? text : '(attachment)', 240);
  await logActivity(taskId, task.projectRef?.sourceId, 'comment_added', actorId, {
    commentId: String(comment._id),
    text: textSnippet,
  });

  try {
    const actorName = await getActorDisplayName(actorId);
    const mentions = Array.isArray(data.mentions) ? data.mentions : [];
    for (const uid of mentions) {
      await notificationService.notifyMention(uid, task, comment._id, actorId, actorName);
    }
  } catch { /* non-critical */ }

  const userMap = await resolveUsersByIds([String(actorId)]);
  const u = userMap[String(actorId)] || {};
  const enrichedComment = {
    ...comment.toObject(),
    userDisplayName: displayName(u),
    userEmail: u.email || '',
    userAvatarUrl: (u.imageUrl && String(u.imageUrl).trim()) || '',
  };

  broadcastToV2Project(task.projectRef?.sourceId, 'commentAdded', {
    taskId: String(taskId),
    projectSourceId: Number(task.projectRef?.sourceId),
    comment: enrichedComment,
  });

  return enrichedComment;
}

// ── Nav views ─────────────────────────────────────────────────────────────────

async function enrichTasksNav(tasks) {
  if (!tasks?.length) return [];
  const legacyIds = [
    ...new Set(
      tasks
        .map((t) => Number(t.projectRef?.sourceId))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  let titleByLegacy = {};
  if (legacyIds.length) {
    const projects = await CoreProject.find({ legacyId: { $in: legacyIds }, isDeleted: false })
      .select('legacyId title')
      .lean();
    titleByLegacy = Object.fromEntries(
      projects.map((p) => [Number(p.legacyId), (p.title && String(p.title).trim()) || '']),
    );
  }

  const withTitles = tasks.map((t) => ({
    ...t,
    projectName: titleByLegacy[Number(t.projectRef?.sourceId)] || '',
  }));

  return Promise.all(withTitles.map((t) => enrichTaskUsers(t)));
}

async function getInbox(actorId, isAdmin) {
  if (isAdmin) {
    const rows = await TaskV2.find({
      status: 'active',
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return enrichTasksNav(rows);
  }

  const accessible = [...await taskAccess.getAccessibleProjectSourceIds(actorId)];
  const collabIds = await collaboratorTaskIdsForUser(actorId);
  const orCond = [];
  if (accessible.length) {
    orCond.push({
      'assignees.userId': actorId,
      'projectRef.sourceId': { $in: accessible },
    });
  }
  if (collabIds.length) orCond.push({ _id: { $in: collabIds } });
  if (!orCond.length) return [];

  const rows = await TaskV2.find({
    status: 'active',
    $or: orCond,
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return enrichTasksNav(rows);
}

async function getMyTasks(actorId, isAdmin) {
  if (isAdmin) {
    const rows = await TaskV2.find({
      status: { $ne: 'archived' },
    })
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(200)
      .lean();
    return enrichTasksNav(rows);
  }

  const accessible = [...await taskAccess.getAccessibleProjectSourceIds(actorId)];
  const collabIds = await collaboratorTaskIdsForUser(actorId);
  const orCond = [];
  if (accessible.length) {
    orCond.push({
      'assignees.userId': actorId,
      'projectRef.sourceId': { $in: accessible },
    });
  }
  if (collabIds.length) orCond.push({ _id: { $in: collabIds } });
  if (!orCond.length) return [];

  const rows = await TaskV2.find({
    status: { $ne: 'archived' },
    $or: orCond,
  })
    .sort({ dueDate: 1, createdAt: -1 })
    .limit(200)
    .lean();
  return enrichTasksNav(rows);
}

async function getMentions(actorId, isAdmin) {
  const comments = await TaskCommentV2.find({ mentions: actorId, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  if (!comments.length) return [];

  const taskIds = [...new Set(comments.map((c) => String(c.taskId)).filter(Boolean))];
  const authorIds = [...new Set(comments.map((c) => String(c.userId)).filter(Boolean))];

  const [taskDocs, userMap] = await Promise.all([
    taskIds.length ? TaskV2.find({ _id: { $in: taskIds } }).select('title taskNumber projectRef status').lean() : [],
    resolveUsersByIds(authorIds),
  ]);

  const taskMap = Object.fromEntries(taskDocs.map((t) => [String(t._id), t]));

  const readability = await Promise.all(
    taskDocs.map((t) => taskAccess.canReadTask(t, actorId, isAdmin)),
  );
  const readableIds = new Set(
    taskDocs.filter((_, i) => readability[i]).map((t) => String(t._id)),
  );

  const legacyIds = [
    ...new Set(taskDocs.map((t) => Number(t.projectRef?.sourceId)).filter((n) => Number.isFinite(n) && n > 0)),
  ];
  let titleByLegacy = {};
  if (legacyIds.length) {
    const projects = await CoreProject.find({ legacyId: { $in: legacyIds }, isDeleted: false })
      .select('legacyId title')
      .lean();
    titleByLegacy = Object.fromEntries(
      projects.map((p) => [Number(p.legacyId), (p.title && String(p.title).trim()) || '']),
    );
  }

  const rows = [];
  for (const c of comments) {
    const tid = String(c.taskId);
    const task = taskMap[tid];
    if (!task || !readableIds.has(tid)) continue;

    const authorUser = userMap[String(c.userId)] || {};
    const legacy = Number(task.projectRef?.sourceId);

    rows.push({
      _id: String(c._id),
      taskId: tid,
      text: c.text,
      createdAt: c.createdAt,
      authorName: displayName(authorUser) || 'Someone',
      authorEmail: authorUser.email || '',
      taskTitle: task.title || 'Untitled task',
      taskNumber: task.taskNumber,
      projectSourceId: Number.isFinite(legacy) ? legacy : null,
      projectName: Number.isFinite(legacy) ? (titleByLegacy[legacy] || '') : '',
    });
  }

  return rows;
}

async function enrichActivityDocuments(activities) {
  if (!activities?.length) return [];

  const taskIds = [...new Set(activities.map((a) => String(a.taskId)).filter(Boolean))];
  const userIds = [...new Set(activities.map((a) => String(a.performedBy)).filter(Boolean))];

  const [taskDocs, userMap] = await Promise.all([
    TaskV2.find({ _id: { $in: taskIds } }).select('title taskNumber projectRef').lean(),
    resolveUsersByIds(userIds),
  ]);

  const taskMap = Object.fromEntries(taskDocs.map((t) => [String(t._id), t]));

  const legacyIds = [
    ...new Set(taskDocs.map((t) => Number(t.projectRef?.sourceId)).filter((n) => Number.isFinite(n) && n > 0)),
  ];
  let titleByLegacy = {};
  if (legacyIds.length) {
    const projects = await CoreProject.find({ legacyId: { $in: legacyIds }, isDeleted: false })
      .select('legacyId title')
      .lean();
    titleByLegacy = Object.fromEntries(
      projects.map((p) => [Number(p.legacyId), (p.title && String(p.title).trim()) || '']),
    );
  }

  return activities.map((a) => {
    const t = taskMap[String(a.taskId)];
    const actorUser = userMap[String(a.performedBy)] || {};
    const legacy = Number(t?.projectRef?.sourceId);

    return {
      _id: String(a._id),
      action: a.action,
      taskId: String(a.taskId),
      taskTitle: t?.title || 'Untitled task',
      taskNumber: t?.taskNumber,
      performedBy: String(a.performedBy),
      performedByName: displayName(actorUser) || 'Someone',
      projectRef: a.projectRef || t?.projectRef,
      projectName: Number.isFinite(legacy) ? (titleByLegacy[legacy] || '') : '',
      meta: a.meta || {},
      createdAt: a.createdAt,
    };
  });
}

async function getActivityFeed(actorId, isAdmin) {
  let taskIds = [];

  if (isAdmin) {
    const tasks = await TaskV2.find({ status: { $ne: 'archived' } }).select('_id').limit(400).lean();
    taskIds = tasks.map((t) => t._id);
  } else {
    const sourceIds = [...await taskAccess.getAccessibleProjectSourceIds(actorId)];
    const collabIds = await collaboratorTaskIdsForUser(actorId);

    const fromProjects = sourceIds.length
      ? await TaskV2.find({
        'projectRef.sourceId': { $in: sourceIds },
        status: { $ne: 'archived' },
      }).select('_id').limit(400).lean()
      : [];

    const fromCollab = collabIds.length
      ? await TaskV2.find({
        _id: { $in: collabIds },
        status: { $ne: 'archived' },
      }).select('_id').limit(200).lean()
      : [];

    const seen = new Set();
    taskIds = [];
    for (const t of fromProjects) {
      const s = String(t._id);
      if (!seen.has(s)) {
        seen.add(s);
        taskIds.push(t._id);
      }
    }
    for (const t of fromCollab) {
      const s = String(t._id);
      if (!seen.has(s)) {
        seen.add(s);
        taskIds.push(t._id);
      }
    }

    if (!taskIds.length) return [];
  }

  if (!taskIds.length) return [];

  const activities = await TaskActivityV2.find({ taskId: { $in: taskIds } })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return enrichActivityDocuments(activities);
}

async function getCalendar(actorId, isAdmin) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAhead = new Date();
  sixtyDaysAhead.setDate(sixtyDaysAhead.getDate() + 60);

  if (isAdmin) {
    return TaskV2.find({
      status: { $ne: 'archived' },
      dueDate: { $gte: thirtyDaysAgo, $lte: sixtyDaysAhead },
    }).sort({ dueDate: 1 }).lean();
  }

  const accessible = [...await taskAccess.getAccessibleProjectSourceIds(actorId)];
  const collabIds = await collaboratorTaskIdsForUser(actorId);
  const orCond = [];
  if (accessible.length) {
    orCond.push({
      'assignees.userId': actorId,
      'projectRef.sourceId': { $in: accessible },
    });
  }
  if (collabIds.length) orCond.push({ _id: { $in: collabIds } });
  if (!orCond.length) return [];

  return TaskV2.find({
    status: { $ne: 'archived' },
    dueDate: { $gte: thirtyDaysAgo, $lte: sixtyDaysAhead },
    $or: orCond,
  }).sort({ dueDate: 1 }).lean();
}

async function getReports(actorId, isAdmin, projectSourceId) {
  const now = new Date();
  let q = {};

  if (!isAdmin) {
    const ids = [...await taskAccess.getAccessibleProjectSourceIds(actorId)];
    if (!ids.length) return EMPTY_REPORTS;
    q['projectRef.sourceId'] = { $in: ids };
  }

  if (projectSourceId != null && String(projectSourceId).trim() !== '') {
    const pid = Number(projectSourceId);
    if (!Number.isFinite(pid)) throw err('Invalid project', 400);
    if (!isAdmin) {
      const allowed = await taskAccess.getAccessibleProjectSourceIds(actorId);
      if (!allowed.has(pid)) throw err('Access denied', 403);
    }
    q = { 'projectRef.sourceId': pid };
  }

  const [
    activeCount,
    completedCount,
    overdueCount,
    byStatusAgg,
    byPriorityAgg,
    byProjectAgg,
    byAssigneeAgg,
  ] = await Promise.all([
    TaskV2.countDocuments({ ...q, status: 'active' }),
    TaskV2.countDocuments({ ...q, status: 'completed' }),
    TaskV2.countDocuments({ ...q, status: 'active', dueDate: { $lt: now } }),
    TaskV2.aggregate([
      { $match: { ...q, status: { $ne: 'archived' } } },
      { $group: { _id: '$workflowStatusId', count: { $sum: 1 } } },
    ]),
    TaskV2.aggregate([
      { $match: { ...q, status: { $ne: 'archived' } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    TaskV2.aggregate([
      { $match: { ...q, status: { $ne: 'archived' } } },
      { $group: { _id: '$projectRef.sourceId', count: { $sum: 1 } } },
    ]),
    TaskV2.aggregate([
      { $match: { ...q, status: { $ne: 'archived' } } },
      { $unwind: '$assignees' },
      { $group: { _id: '$assignees.userId', name: { $first: '$assignees.name' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
  ]);

  // Enrich status groups with names/colors from workflow status collection
  const statusIds = byStatusAgg.map((s) => s._id).filter(Boolean);
  const statusDocs = await TaskWorkflowStatusV2.find({ _id: { $in: statusIds } })
    .select('name color category').lean();
  const statusMap = {};
  for (const s of statusDocs) statusMap[String(s._id)] = s;
  const byStatus = byStatusAgg.map((s) => ({
    _id: s._id,
    name: statusMap[String(s._id)]?.name || 'Unknown',
    color: statusMap[String(s._id)]?.color || '#9CA3AF',
    category: statusMap[String(s._id)]?.category,
    count: s.count,
  }));

  // Enrich project groups with project names
  const projectIds = byProjectAgg.map((p) => p._id).filter(Boolean);
  const projectDocs = await CoreProject.find({ legacyId: { $in: projectIds } })
    .select('title legacyId').lean();
  const projMap = {};
  for (const p of projectDocs) projMap[Number(p.legacyId)] = p.title;
  const byProject = byProjectAgg
    .map((p) => ({ projectId: p._id, projectName: projMap[p._id] || `Project #${p._id}`, count: p.count }))
    .sort((a, b) => b.count - a.count);

  // In-progress count: active tasks in non-terminal statuses
  const inProgressStatuses = await TaskWorkflowStatusV2.find({
    category: 'active',
  }).select('_id').lean();
  const ipIds = inProgressStatuses.map((s) => s._id);
  const inProgressCount = await TaskV2.countDocuments({
    ...q, status: 'active', workflowStatusId: { $in: ipIds },
  });

  return {
    summary: {
      total: activeCount + completedCount,
      active: activeCount,
      completed: completedCount,
      overdue: overdueCount,
      inProgress: inProgressCount,
    },
    byStatus,
    byPriority: byPriorityAgg,
    byProject,
    byAssignee: byAssigneeAgg,
  };
}

async function getWorkload(actorId, isAdmin) {
  if (!isAdmin) throw err('Workload reports require admin access', 403);
  const now = new Date();

  const [assigneeAgg, overdueAgg] = await Promise.all([
    TaskV2.aggregate([
      { $match: { status: { $ne: 'archived' } } },
      { $unwind: '$assignees' },
      { $group: { _id: '$assignees.userId', name: { $first: '$assignees.name' }, total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 30 },
    ]),
    TaskV2.aggregate([
      { $match: { status: 'active', dueDate: { $lt: now } } },
      { $unwind: '$assignees' },
      { $group: { _id: '$assignees.userId', overdue: { $sum: 1 } } },
    ]),
  ]);

  const overdueMap = {};
  for (const o of overdueAgg) overdueMap[String(o._id)] = o.overdue;

  return assigneeAgg.map((u) => ({
    userId: String(u._id),
    name: u.name || String(u._id).slice(-6),
    total: u.total,
    overdue: overdueMap[String(u._id)] || 0,
  }));
}

async function getProjectHealth(actorId, isAdmin) {
  if (!isAdmin) throw err('Project health reports require admin access', 403);
  const now = new Date();

  const projects = await CoreProject.find({ isDeleted: false, isActive: true })
    .select('legacyId title').lean();
  const projectIds = projects.map((p) => Number(p.legacyId));
  const projMap = {};
  for (const p of projects) projMap[Number(p.legacyId)] = p.title;

  const [totalAgg, overdueAgg, completedAgg] = await Promise.all([
    TaskV2.aggregate([
      { $match: { 'projectRef.sourceId': { $in: projectIds }, status: { $ne: 'archived' } } },
      { $group: { _id: '$projectRef.sourceId', total: { $sum: 1 } } },
    ]),
    TaskV2.aggregate([
      { $match: { 'projectRef.sourceId': { $in: projectIds }, status: 'active', dueDate: { $lt: now } } },
      { $group: { _id: '$projectRef.sourceId', overdue: { $sum: 1 } } },
    ]),
    TaskV2.aggregate([
      { $match: { 'projectRef.sourceId': { $in: projectIds }, status: 'completed' } },
      { $group: { _id: '$projectRef.sourceId', completed: { $sum: 1 } } },
    ]),
  ]);

  const totalMap = {}, overdueMap = {}, completedMap = {};
  for (const t of totalAgg) totalMap[t._id] = t.total;
  for (const o of overdueAgg) overdueMap[o._id] = o.overdue;
  for (const c of completedAgg) completedMap[c._id] = c.completed;

  return projectIds
    .filter((id) => totalMap[id] > 0)
    .map((id) => {
      const total = totalMap[id] || 0;
      const overdue = overdueMap[id] || 0;
      const completed = completedMap[id] || 0;
      const active = total - completed;
      let health = 'healthy';
      if (overdue > 0 && active > 0 && overdue >= active * 0.5) health = 'overdue_heavy';
      else if (overdue > 0) health = 'at_risk';
      return { projectId: id, projectName: projMap[id] || `Project #${id}`, total, overdue, completed, active, health };
    });
}

async function getActivitySummary() {
  const activities = await TaskActivityV2.find()
    .sort({ createdAt: -1 }).limit(50).lean();

  const taskIds = [...new Set(activities.map((a) => a.taskId).filter(Boolean))];
  const userIds = [...new Set(activities.map((a) => String(a.performedBy)).filter(Boolean))];

  const [taskDocs, userDocs] = await Promise.all([
    TaskV2.find({ _id: { $in: taskIds } }).select('title taskNumber').lean(),
    AccountAdmin.find({ _id: { $in: userIds } }).select('name').lean(),
  ]);

  const taskMap = {};
  for (const t of taskDocs) taskMap[String(t._id)] = t;
  const userMap = {};
  for (const u of userDocs) userMap[String(u._id)] = u.name;

  return activities.map((a) => ({
    _id: a._id,
    action: a.action,
    taskId: a.taskId,
    taskTitle: taskMap[String(a.taskId)]?.title || 'Untitled',
    taskNumber: taskMap[String(a.taskId)]?.taskNumber,
    performedBy: a.performedBy,
    performedByName: userMap[String(a.performedBy)] || 'Unknown',
    projectRef: a.projectRef,
    meta: a.meta,
    createdAt: a.createdAt,
  }));
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function assertProjectWorkflowReadable(projectSourceId, actorId, isPlatformAdmin) {
  await taskAccess.assertProjectReadable(projectSourceId, actorId, isPlatformAdmin);
}

async function logActivity(taskId, projectSourceId, action, performedBy, meta = {}) {
  try {
    await TaskActivityV2.create({
      taskId,
      projectRef: { sourceId: Number(projectSourceId) },
      action,
      performedBy,
      meta,
    });
  } catch { /* non-critical */ }
}

module.exports = {
  getProjects,
  getProjectBoard,
  assertProjectWorkflowReadable,
  createTask,
  updateTask,
  moveTask,
  completeTask,
  archiveTask,
  restoreTask,
  permanentDeleteTask,
  listArchivedTasks,
  getTask,
  getComments,
  addComment,
  uploadTaskAttachment,
  uploadTaskCommentFile,
  deleteTaskAttachment,
  getInbox,
  getMyTasks,
  getMentions,
  getActivityFeed,
  getCalendar,
  getReports,
  getWorkload,
  getProjectHealth,
  getActivitySummary,
};
