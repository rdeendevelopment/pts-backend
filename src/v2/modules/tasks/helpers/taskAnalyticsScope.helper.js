const { getTaskModel } = require('../models/task.model');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskCollaboratorRepository = require('../repositories/taskCollaborator.repository');
const boardShareRepository = require('../../board-shares/repositories/boardShare.repository');
const {
  isBoardShareClientUser,
  resolveClientIdForAccount,
} = require('../../board-shares/helpers/boardShareAccess.helper');
const {
  canViewAllTaskProjects,
  resolveUserIdFromAuth,
} = require('./taskAccessScope.helper');

async function listActiveNonArchivedTaskIds({ limit = 400 } = {}) {
  const Task = getTaskModel();
  const rows = await Task.find({ isDeleted: false, status: { $ne: 'archived' } })
    .select('_id')
    .limit(limit)
    .lean();
  return rows.map((row) => row._id);
}

async function listClientSharedTaskIds(req, { limit = 400 } = {}) {
  const clientId = resolveClientIdForAccount(req);
  if (!clientId) return [];

  const share = await boardShareRepository.findActiveByClientId(clientId);
  if (!share?.projectIds?.length) return [];

  const Task = getTaskModel();
  const rows = await Task.find({
    isDeleted: false,
    projectId: { $in: share.projectIds },
  })
    .select('_id')
    .limit(limit)
    .lean();

  return rows.map((row) => row._id);
}

async function listScopedTaskIds(req, { limit = 400 } = {}) {
  if (isBoardShareClientUser(req)) {
    return listClientSharedTaskIds(req, { limit });
  }

  if (canViewAllTaskProjects(req)) {
    return listActiveNonArchivedTaskIds({ limit });
  }

  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const [accessibleProjectIds, collaboratorTaskIds] = await Promise.all([
    projectAssignmentRepository.listActiveProjectIdsByUserId(userId),
    taskCollaboratorRepository.listActiveTaskIdsByUserId(userId),
  ]);

  const Task = getTaskModel();
  const seen = new Set();
  const taskIds = [];

  const pushIds = (rows) => {
    for (const row of rows) {
      const key = String(row._id);
      if (seen.has(key)) continue;
      seen.add(key);
      taskIds.push(row._id);
    }
  };

  if (accessibleProjectIds.length) {
    const fromProjects = await Task.find({
      isDeleted: false,
      status: { $ne: 'archived' },
      projectId: { $in: accessibleProjectIds },
    })
      .select('_id')
      .limit(limit)
      .lean();
    pushIds(fromProjects);
  }

  if (collaboratorTaskIds.length && accessibleProjectIds.length) {
    const fromCollab = await Task.find({
      _id: { $in: collaboratorTaskIds },
      projectId: { $in: accessibleProjectIds },
      isDeleted: false,
      status: { $ne: 'archived' },
    })
      .select('_id')
      .limit(Math.max(0, limit - taskIds.length))
      .lean();
    pushIds(fromCollab);
  }

  return taskIds;
}

function calendarDateRange(req) {
  const { startDate, endDate } = req?.query || {};

  let from = new Date();
  let to = new Date();

  if (startDate) {
    try {
      from = new Date(startDate);
      if (isNaN(from.getTime())) from = new Date();
    } catch {
      from = new Date();
    }
  } else {
    from.setDate(from.getDate() - 30);
  }

  if (endDate) {
    try {
      to = new Date(endDate);
      if (isNaN(to.getTime())) to = new Date();
    } catch {
      to = new Date();
    }
  } else {
    to.setDate(to.getDate() + 60);
  }

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

async function buildCalendarMatch(req) {
  const { from, to } = calendarDateRange(req);
  const base = {
    isDeleted: false,
    dueDate: { $gte: from, $lte: to },
  };

  if (canViewAllTaskProjects(req)) {
    return base;
  }

  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const [accessibleProjectIds, collaboratorTaskIds] = await Promise.all([
    projectAssignmentRepository.listActiveProjectIdsByUserId(userId),
    taskCollaboratorRepository.listActiveTaskIdsByUserId(userId),
  ]);

  if (!accessibleProjectIds.length) return null;
  base.projectId = { $in: accessibleProjectIds };

  const orCond = [];
  if (accessibleProjectIds.length) {
    orCond.push({
      'assignees.userId': userId,
      projectId: { $in: accessibleProjectIds },
    });
  }
  if (collaboratorTaskIds.length) {
    orCond.push({ _id: { $in: collaboratorTaskIds } });
  }

  if (!orCond.length) {
    return null;
  }

  return { ...base, $or: orCond };
}

async function buildReportsMatch(req, projectId = null) {
  const match = { isDeleted: false };

  if (projectId) {
    match.projectId = projectId;
  }

  if (canViewAllTaskProjects(req)) {
    return match;
  }

  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const accessibleProjectIds = await projectAssignmentRepository.listActiveProjectIdsByUserId(userId);
  if (!accessibleProjectIds.length) {
    return null;
  }

  if (projectId) {
    const allowed = accessibleProjectIds.some((id) => String(id) === String(projectId));
    return allowed ? match : null;
  }

  match.projectId = { $in: accessibleProjectIds };
  return match;
}

module.exports = {
  listScopedTaskIds,
  listClientSharedTaskIds,
  buildCalendarMatch,
  buildReportsMatch,
  calendarDateRange,
};
