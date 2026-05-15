// Central Task V2 RBAC: project visibility (assignment + task-project roles), viewer vs editor,
// and per-task collaborator access. Used by board.service and admin.service.

const { ProjectAssignment } = require('../../../MongoModels');
const { TaskProjectMemberV2, TaskCollaboratorV2 } = require('../models');

function err(msg, status = 400) {
  const e = new Error(msg); e.status = status; return e;
}

/**
 * Projects visible in sidebar / boards: legacy assignment OR any active TaskProjectMemberV2 row.
 */
async function getAccessibleProjectSourceIds(actorId) {
  if (!actorId) return new Set();
  const [assignmentRows, memberRows] = await Promise.all([
    ProjectAssignment.find({
      userId: actorId,
      isDeleted: false,
      status: 'assigned',
    }).select('legacyProjectId').lean(),
    TaskProjectMemberV2.find({ userId: actorId, isActive: true }).select('projectRef.sourceId').lean(),
  ]);
  const ids = new Set();
  for (const a of assignmentRows) {
    const n = Number(a.legacyProjectId);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  }
  for (const m of memberRows) {
    const n = Number(m.projectRef?.sourceId);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  }
  return ids;
}

async function assertProjectReadable(projectSourceId, actorId, isPlatformAdmin) {
  if (isPlatformAdmin) return;
  const pid = Number(projectSourceId);
  if (!Number.isFinite(pid)) throw err('Invalid project', 400);
  const ids = await getAccessibleProjectSourceIds(actorId);
  if (!ids.has(pid)) throw err('Access denied — not permitted for this project', 403);
}

/**
 * Effective task-system role for a project. Assignment-only users default to `member`.
 */
async function getEffectiveProjectRole(projectSourceId, actorId, isPlatformAdmin) {
  if (isPlatformAdmin) return 'owner';
  if (!actorId) return null;
  const pid = Number(projectSourceId);
  if (!Number.isFinite(pid)) return null;

  const tm = await TaskProjectMemberV2.findOne({
    'projectRef.sourceId': pid,
    userId: actorId,
    isActive: true,
  }).lean();
  if (tm?.role) return tm.role;

  const assignment = await ProjectAssignment.findOne({
    legacyProjectId: pid,
    userId: actorId,
    isDeleted: false,
    status: 'assigned',
  }).lean();
  return assignment ? 'member' : null;
}

async function assertCanEditTasksOnProject(projectSourceId, actorId, isPlatformAdmin) {
  const role = await getEffectiveProjectRole(projectSourceId, actorId, isPlatformAdmin);
  if (!role) throw err('Access denied', 403);
  if (role === 'viewer') throw err('Viewers cannot edit tasks', 403);
}

async function findActiveCollaboration(taskId, userId) {
  return TaskCollaboratorV2.findOne({
    taskId,
    userId,
    isActive: true,
  }).lean();
}

async function resolveTaskAccess(task, actorId, isPlatformAdmin) {
  if (!task) {
    return {
      canRead: false,
      canComment: false,
      canEdit: false,
      canMove: false,
      canArchive: false,
      collaboratorOnly: false,
    };
  }
  if (isPlatformAdmin) {
    return {
      canRead: true,
      canComment: true,
      canEdit: true,
      canMove: true,
      canArchive: true,
      collaboratorOnly: false,
      role: 'owner',
    };
  }

  const pid = Number(task.projectRef?.sourceId);
  const role = Number.isFinite(pid)
    ? await getEffectiveProjectRole(pid, actorId, false)
    : null;

  if (role === 'owner' || role === 'admin' || role === 'member') {
    return {
      canRead: true,
      canComment: true,
      canEdit: true,
      canMove: true,
      canArchive: true,
      collaboratorOnly: false,
      role,
    };
  }
  if (role === 'viewer') {
    return {
      canRead: true,
      canComment: false,
      canEdit: false,
      canMove: false,
      canArchive: false,
      collaboratorOnly: false,
      role: 'viewer',
    };
  }

  const collab = await findActiveCollaboration(task._id, actorId);
  if (collab) {
    const at = collab.accessType || 'comment';
    const canEdit = at === 'edit';
    return {
      canRead: true,
      canComment: ['comment', 'review', 'edit'].includes(at),
      canEdit,
      canMove: canEdit,
      canArchive: false,
      collaboratorOnly: true,
      accessType: at,
    };
  }

  return {
    canRead: false,
    canComment: false,
    canEdit: false,
    canMove: false,
    canArchive: false,
    collaboratorOnly: false,
  };
}

async function assertTaskReadable(task, actorId, isPlatformAdmin) {
  const a = await resolveTaskAccess(task, actorId, isPlatformAdmin);
  if (!a.canRead) throw err('Access denied', 403);
}

async function assertTaskCommentAllowed(task, actorId, isPlatformAdmin) {
  const a = await resolveTaskAccess(task, actorId, isPlatformAdmin);
  if (!a.canComment) throw err('You do not have permission to comment on this task', 403);
}

async function assertTaskMutationAllowed(task, actorId, isPlatformAdmin) {
  const a = await resolveTaskAccess(task, actorId, isPlatformAdmin);
  if (!a.canEdit) throw err('You do not have permission to edit this task', 403);
}

async function assertTaskMoveAllowed(task, actorId, isPlatformAdmin) {
  const a = await resolveTaskAccess(task, actorId, isPlatformAdmin);
  if (!a.canMove) throw err('You do not have permission to move this task', 403);
}

async function assertTaskArchiveAllowed(task, actorId, isPlatformAdmin) {
  const a = await resolveTaskAccess(task, actorId, isPlatformAdmin);
  if (!a.canArchive) throw err('You do not have permission to archive this task', 403);
}

/** Restore/archive-like ops: project editors only (not collaborators-only). */
async function assertTaskRestoreAllowed(task, actorId, isPlatformAdmin) {
  const a = await resolveTaskAccess(task, actorId, isPlatformAdmin);
  if (!a.canEdit || a.collaboratorOnly) throw err('Access denied', 403);
}

async function canReadTask(task, actorId, isPlatformAdmin) {
  const a = await resolveTaskAccess(task, actorId, isPlatformAdmin);
  return !!a.canRead;
}

async function getClientTaskCapabilities(task, actorId, isPlatformAdmin) {
  const a = await resolveTaskAccess(task, actorId, isPlatformAdmin);
  return {
    canEdit: !!a.canEdit,
    canComment: !!a.canComment,
    canMove: !!a.canMove,
    canArchive: !!a.canArchive,
  };
}

module.exports = {
  err,
  getAccessibleProjectSourceIds,
  assertProjectReadable,
  getEffectiveProjectRole,
  assertCanEditTasksOnProject,
  findActiveCollaboration,
  resolveTaskAccess,
  assertTaskReadable,
  assertTaskCommentAllowed,
  assertTaskMutationAllowed,
  assertTaskMoveAllowed,
  assertTaskArchiveAllowed,
  assertTaskRestoreAllowed,
  canReadTask,
  getClientTaskCapabilities,
};
