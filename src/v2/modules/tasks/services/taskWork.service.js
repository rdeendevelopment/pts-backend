const { getTaskModel } = require('../models/task.model');
const { getProjectModel } = require('../../projects/models/project.model');
const { getTaskWorkflowStatusModel } = require('../models/taskWorkflowStatus.model');
const { getTaskCollaboratorModel } = require('../models/taskCollaborator.model');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const { resolveUsersByIds, displayName } = require('../helpers/taskUser.helper');
const { canViewAllTaskProjects, resolveUserIdFromAuth } = require('../helpers/taskAccessScope.helper');
const { resolveTeamScope } = require('./taskTeamDashboard.service');
const { parsePagination, buildPaginationMeta } = require('../helpers/taskAggregateQuery.helper');
const { deriveTaskKeyPrefix } = require('../helpers/taskKeyPrefix.helper');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { Types } = require('mongoose');

function objectId(value, field) {
  return new Types.ObjectId(assertObjectId(value, field));
}

function escapedRegex(value) {
  const term = String(value || '').trim();
  return term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
}

function dayBounds(now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start, end };
}

function addCondition(match, condition) {
  if (!condition || !Object.keys(condition).length) return;
  match.$and = [...(match.$and || []), condition];
}

function avatarUrl(user) {
  return user?.avatarUrl || user?.imageUrl || null;
}

function assigneeSummaries(task, users = {}) {
  return (task?.assignees || []).map((assignee) => {
    const id = String(assignee.userId);
    const user = users[id];
    return {
      userId: id,
      name: displayName(user) || assignee.name || '',
      email: user?.email || assignee.email || '',
      avatarUrl: avatarUrl(user),
    };
  });
}

function dueRange(kind, now = new Date()) {
  const { start } = dayBounds(now);
  const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  const weekEnd = new Date(start); weekEnd.setDate(weekEnd.getDate() + (7 - start.getDay()));
  const next7 = new Date(start); next7.setDate(next7.getDate() + 7);
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  if (kind === 'tomorrow') return { $gte: tomorrow, $lt: dayAfterTomorrow };
  if (kind === 'week') return { $gte: start, $lt: weekEnd };
  if (kind === 'next7') return { $gte: start, $lt: next7 };
  if (kind === 'month') return { $gte: start, $lt: monthEnd };
  return null;
}

function isUnassignedCondition() {
  return { primaryAssigneeId: null, $or: [{ assignees: { $exists: false } }, { assignees: { $size: 0 } }] };
}

function assigneeCondition(userId) {
  return { $or: [
    { primaryAssigneeId: userId },
    { 'assignees.userId': userId },
  ] };
}

function isSuperAdminRequest(req) {
  return canViewAllTaskProjects(req);
}

function projectPersonalScopeCondition(accountId, userId) {
  return { $or: [
    { createdBy: accountId },
    ...assigneeCondition(userId).$or,
  ] };
}

function buildMatch(query = {}) {
  const requestedLifecycle = query.lifecycleState || query.lifecycle || query.status || 'active';
  const lifecycle = ['active', 'completed'].includes(String(requestedLifecycle))
    ? String(requestedLifecycle) : 'active';
  const match = { isDeleted: false, status: lifecycle };
  if (query.projectId) match.projectId = objectId(query.projectId, 'projectId');
  if (query.priority) match.priority = query.priority;
  if (query.workflowStatusId) match.workflowStatusId = objectId(query.workflowStatusId, 'workflowStatusId');
  if (query.workflowStatusIds) {
    const ids = String(query.workflowStatusIds).split(',').filter(Boolean)
      .map((id) => objectId(id, 'workflowStatusIds'));
    match.workflowStatusId = { $in: ids };
  }
  const now = new Date();
  if (String(query.due || '').toLowerCase() === 'overdue' || query.overdue === 'true') {
    match.dueDate = { $lt: now };
    match.status = 'active';
  } else if (String(query.due || '').toLowerCase() === 'today' || query.dueToday === 'true') {
    const { start, end } = dayBounds(now);
    match.dueDate = { $gte: start, $lt: end };
    match.status = 'active';
  } else if (query.dueDateFrom || query.dueDateTo) {
    match.dueDate = {};
    if (query.dueDateFrom) match.dueDate.$gte = new Date(query.dueDateFrom);
    if (query.dueDateTo) match.dueDate.$lte = new Date(query.dueDateTo);
  }
  if (query.dueGroup === 'none') match.dueDate = null;
  if (query.dueGroup === 'upcoming') match.dueDate = { $gte: dayBounds(now).end };
  const regex = escapedRegex(query.search);
  if (regex) match.$or = [{ title: regex }, { description: regex }];
  return match;
}

function collaboratorCaps(accessType) {
  const edit = accessType === 'edit';
  return {
    canView: true, canComment: true, canUploadAttachment: true,
    canDeleteOwnAttachment: true, canEdit: edit, canMove: edit,
    canComplete: edit, canReopen: edit, canArchive: false,
    canRestore: false, canDelete: false, canManageCollaborators: false,
  };
}

const WORKER_CAPS = {
  canView: true, canComment: true, canUploadAttachment: true,
  canDeleteOwnAttachment: true, canEdit: true, canMove: true,
  canComplete: true, canReopen: true, canArchive: true,
  canRestore: true, canDelete: false, canManageCollaborators: true,
};

async function enrichSummaries(tasks, { currentUserId = null, privileged = false } = {}) {
  const taskIds = tasks.map((t) => t._id);
  const projectIds = [...new Set(tasks.map((t) => String(t.projectId)))];
  const statusIds = [...new Set(tasks.map((t) => String(t.workflowStatusId)))];
  const Collaborator = getTaskCollaboratorModel();
  const Project = getProjectModel();
  const Status = getTaskWorkflowStatusModel();
  const [projects, statuses, collaborators] = await Promise.all([
    Project.find({ _id: { $in: projectIds }, isDeleted: false }).select('_id name code').lean(),
    Status.find({ _id: { $in: statusIds } }).select('_id name category color projectId').lean(),
    Collaborator.find({ taskId: { $in: taskIds }, isActive: true })
      .select('taskId userId accessType').lean(),
  ]);
  const userIds = [...new Set(tasks.flatMap((t) => [
    t.primaryAssigneeId,
    ...(t.assignees || []).map((a) => a.userId),
    t.reviewerId,
    ...collaborators.filter((c) => String(c.taskId) === String(t._id)).map((c) => c.userId),
  ]).filter(Boolean).map(String))];
  const users = await resolveUsersByIds(userIds);
  const projectMap = new Map(projects.map((p) => [String(p._id), p]));
  const statusMap = new Map(statuses.map((s) => [String(s._id), s]));
  const collabMap = new Map();
  for (const row of collaborators) {
    const key = String(row.taskId);
    if (!collabMap.has(key)) collabMap.set(key, []);
    collabMap.get(key).push(row);
  }
  return tasks.map((task) => {
    const project = projectMap.get(String(task.projectId));
    const workflowStatus = statusMap.get(String(task.workflowStatusId));
    const primaryId = task.primaryAssigneeId || task.assignees?.[0]?.userId || null;
    const primaryUser = primaryId ? users[String(primaryId)] : null;
    const assignees = assigneeSummaries(task, users);
    const taskCollabs = collabMap.get(String(task._id)) || [];
    const ownCollab = currentUserId
      ? taskCollabs.find((c) => String(c.userId) === String(currentUserId))
      : null;
    const isResponsible = currentUserId && (
      String(primaryId || '') === String(currentUserId)
      || (task.assignees || []).some((a) => String(a.userId) === String(currentUserId))
    );
    return {
      id: String(task._id),
      taskDisplayId: task.taskNumber
        ? `${deriveTaskKeyPrefix(project?.name, project?.code)}-${task.taskNumber}` : null,
      title: task.title,
      project: project ? { id: String(project._id), name: project.name || '' } : null,
      workflowStatus: workflowStatus ? {
        id: String(workflowStatus._id), name: workflowStatus.name,
        category: workflowStatus.category, color: workflowStatus.color,
      } : null,
      priority: task.priority,
      lifecycleStatus: task.status,
      dueDate: task.dueDate,
      primaryAssignee: primaryId ? {
        userId: String(primaryId), name: displayName(primaryUser), email: primaryUser?.email || '',
        avatarUrl: avatarUrl(primaryUser),
      } : null,
      assignees,
      reviewerId: task.reviewerId ? String(task.reviewerId) : null,
      collaborators: taskCollabs.slice(0, 3).map((c) => ({
        userId: String(c.userId), name: displayName(users[String(c.userId)]),
        email: users[String(c.userId)]?.email || '',
        avatarUrl: avatarUrl(users[String(c.userId)]), accessType: c.accessType,
      })),
      collaboratorCount: taskCollabs.length,
      commentCount: Number(task.commentCount || 0),
      attachmentCount: Number(task.attachmentCount ?? (Array.isArray(task.attachments) ? task.attachments.length : 0)),
      updatedAt: task.updatedAt,
      managementFlags: {
        overdue: Boolean(task.status === 'active' && task.dueDate && new Date(task.dueDate) < new Date()),
        dueToday: Boolean(task.status === 'active' && task.dueDate && new Date(task.dueDate) >= dayBounds().start && new Date(task.dueDate) < dayBounds().end),
        unassigned: !primaryId,
        staleDays: task.status === 'active' && task.updatedAt ? Math.max(0, Math.floor((Date.now() - new Date(task.updatedAt).getTime()) / 86400000)) : 0,
        blocked: /^blocked$/i.test(workflowStatus?.name || ''),
        critical: task.priority === 'urgent',
      },
      capabilities: privileged ? { ...WORKER_CAPS, canDelete: true }
        : (!isResponsible && ownCollab) ? collaboratorCaps(ownCollab.accessType) : WORKER_CAPS,
    };
  });
}

async function listMyWork(req, query = {}) {
  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const Collaborator = getTaskCollaboratorModel();
  const match = buildMatch(query);
  if (!isSuperAdminRequest(req)) {
    const projectIds = await projectAssignmentRepository.listActiveProjectIdsByUserId(userId);
    addCondition(match, { projectId: { $in: projectIds } });
  }
  const canViewWholeProject = Boolean(query.projectId) && isSuperAdminRequest(req);
  if (!canViewWholeProject) {
    const personalScope = projectPersonalScopeCondition(
      objectId(req.v2Auth.accountId, 'accountId'), userId,
    ).$or;
    if (!query.projectId) {
      const collaboratorIds = await Collaborator.distinct('taskId', { userId, isActive: true });
      personalScope.push({ _id: { $in: collaboratorIds } });
    }
    addCondition(match, { $or: personalScope });
  }
  if (query.assigneeUserId) {
    const assigneeUserId = objectId(query.assigneeUserId, 'assigneeUserId');
    addCondition(match, assigneeCondition(assigneeUserId));
  }
  if (query.workflowCategory) {
    const Status = getTaskWorkflowStatusModel();
    const ids = await Status.distinct('_id', { category: query.workflowCategory, status: 'active' });
    match.workflowStatusId = { $in: ids };
  }
  if (['review', 'attention', 'in_progress'].includes(query.preset)) {
    const Status = getTaskWorkflowStatusModel();
    const [reviewIds, blockedIds, progressIds] = await Promise.all([
      Status.distinct('_id', { name: { $regex: /(review|qa)/i }, status: 'active' }),
      Status.distinct('_id', { name: { $regex: /^blocked$/i }, status: 'active' }),
      Status.distinct('_id', { name: { $regex: /(progress|doing)/i }, status: 'active' }),
    ]);
    if (query.preset === 'review') addCondition(match, { workflowStatusId: { $in: reviewIds } });
    else if (query.preset === 'in_progress') addCondition(match, { workflowStatusId: { $in: progressIds } });
    else addCondition(match, { $or: [
      { dueDate: { $lt: new Date(), $ne: null } }, { priority: { $in: ['urgent', 'high'] } },
      { workflowStatusId: { $in: [...reviewIds, ...blockedIds] } },
    ] });
  }
  return list(match, query, { currentUserId: userId, privileged: canViewWholeProject, summaryMatch: { ...match, $and: match.$and ? [...match.$and] : [] } });
}

async function listTeamWork(req, query = {}) {
  const scope = await resolveTeamScope(req);
  const match = buildMatch(query);
  if (!isSuperAdminRequest(req)) {
    const projectIds = await projectAssignmentRepository.listActiveProjectIdsByUserId(scope.requesterUserId);
    addCondition(match, { projectId: { $in: projectIds } });
  }
  const Collaborator = getTaskCollaboratorModel();
  if (query.userId) {
    const userId = objectId(query.userId, 'userId');
    if (scope.teamUserIds?.length && !scope.teamUserIds.includes(String(userId))) {
      match._id = { $in: [] };
    } else {
      const collaboratorIds = await Collaborator.distinct('taskId', { userId, isActive: true });
      const mode = query.accountabilityMode || 'involved';
      const primary = assigneeCondition(userId);
      if (mode === 'primary') addCondition(match, primary);
      else if (mode === 'collaborator') addCondition(match, { _id: { $in: collaboratorIds } });
      else addCondition(match, { $or: [...primary.$or, { _id: { $in: collaboratorIds } }] });
    }
  } else if (scope.teamUserIds?.length) {
    const teamUserIds = scope.teamUserIds.map((id) => objectId(id, 'teamUserIds'));
    const collaboratorIds = await Collaborator.distinct('taskId', {
      userId: { $in: teamUserIds }, isActive: true,
    });
    addCondition(match, { $or: [
      { primaryAssigneeId: { $in: teamUserIds } },
      { 'assignees.userId': { $in: teamUserIds } },
      { _id: { $in: collaboratorIds } },
    ] });
  }
  if (query.workflowCategory) {
    const Status = getTaskWorkflowStatusModel();
    const ids = await Status.distinct('_id', { category: query.workflowCategory, status: 'active' });
    match.workflowStatusId = { $in: ids };
  }
  if (query.createdBy === 'me') addCondition(match, { createdBy: objectId(req.v2Auth.accountId, 'createdBy') });
  else if (query.createdBy) addCondition(match, { createdBy: objectId(query.createdBy, 'createdBy') });

  const Status = getTaskWorkflowStatusModel();
  const [reviewIds, blockedIds] = await Promise.all([
    Status.distinct('_id', { name: { $regex: /^(review|code review|in review|peer review|qa review|approval|testing review)$/i }, status: 'active' }),
    Status.distinct('_id', { name: { $regex: /^blocked$/i }, status: 'active' }),
  ]);
  const preset = String(query.preset || 'all');
  const now = new Date();
  const staleDays = Number(query.staleDays || 7);
  const staleBefore = new Date(now.getTime() - staleDays * 86400000);
  const unassigned = isUnassignedCondition();
  const dueWindow = dueRange(preset, now);
  if (query.unassigned === 'true' || preset === 'unassigned') addCondition(match, unassigned);
  if (preset === 'overdue') addCondition(match, { dueDate: { $lt: now }, status: 'active' });
  if (preset === 'today') { const { start, end } = dayBounds(now); addCondition(match, { dueDate: { $gte: start, $lt: end } }); }
  if (dueWindow) addCondition(match, { dueDate: dueWindow });
  if (preset === 'critical') addCondition(match, { priority: 'urgent' });
  if (preset === 'blocked') addCondition(match, { workflowStatusId: { $in: blockedIds } });
  if (preset === 'review') addCondition(match, { workflowStatusId: { $in: reviewIds } });
  if (preset === 'stale') addCondition(match, { updatedAt: { $lte: staleBefore }, status: 'active' });
  if (preset === 'incomplete') addCondition(match, { $or: [unassigned, { dueDate: null }, { priority: 'none' }, { workflowStatusId: null }] });
  if (preset === 'attention') addCondition(match, { $or: [
    { dueDate: { $lt: now } }, { priority: 'urgent' }, unassigned,
    { workflowStatusId: { $in: [...blockedIds, ...reviewIds] } }, { updatedAt: { $lte: staleBefore } },
  ] });
  const summaryMatch = { ...match };
  if (match.$and) summaryMatch.$and = [...match.$and];
  return list(match, query, { currentUserId: scope.requesterUserId, privileged: scope.isAdmin, summaryMatch, reviewIds, blockedIds });
}

async function list(match, query, context) {
  const pagination = parsePagination(query, { defaultLimit: 50 });
  const Task = getTaskModel();
  const projection = { projectId: 1, workflowStatusId: 1, taskNumber: 1, title: 1, priority: 1, status: 1, dueDate: 1, primaryAssigneeId: 1, reviewerId: 1, assignees: 1, commentCount: 1, attachmentCount: { $size: { $ifNull: ['$attachments', []] } }, updatedAt: 1 };
  const defaultDirection = ['updatedAt', 'createdAt'].includes(query.sort) ? -1 : 1;
  const direction = query.dir ? (String(query.dir) === 'desc' ? -1 : 1) : defaultDirection;
  const sortField = ({ updatedAt: 'updatedAt', dueDate: 'dueDate', priority: 'priority', createdAt: 'createdAt', project: 'projectId', assignee: 'primaryAssigneeId' })[query.sort] || 'dueDate';
  const sort = { [sortField]: direction, _id: direction };
  const itemSortStages = query.sort === 'priority'
    ? [{ $set: { __priorityRank: { $switch: { branches: [
      { case: { $eq: ['$priority', 'urgent'] }, then: 0 },
      { case: { $eq: ['$priority', 'high'] }, then: 1 },
      { case: { $eq: ['$priority', 'medium'] }, then: 2 },
      { case: { $eq: ['$priority', 'low'] }, then: 3 },
    ], default: 4 } } } }, { $sort: { __priorityRank: direction, _id: direction } }]
    : [{ $sort: sort }];
  const now = new Date(); const { start, end } = dayBounds(now);
  const summaryBase = context.summaryMatch || match;
  const summaryRows = await Task.aggregate([{ $match: summaryBase }, { $facet: {
      items: [...itemSortStages, { $skip: pagination.skip }, { $limit: pagination.limit }, { $project: projection }],
      total: [{ $count: 'count' }],
      active: [{ $match: { status: 'active' } }, { $count: 'count' }],
      overdue: [{ $match: { status: 'active', dueDate: { $lt: now } } }, { $count: 'count' }],
      dueToday: [{ $match: { status: 'active', dueDate: { $gte: start, $lt: end } } }, { $count: 'count' }],
      critical: [{ $match: { status: 'active', priority: 'urgent' } }, { $count: 'count' }],
      blocked: [{ $match: { status: 'active', workflowStatusId: { $in: context.blockedIds || [] } } }, { $count: 'count' }],
      unassigned: [{ $match: { status: 'active', ...isUnassignedCondition() } }, { $count: 'count' }],
      statusGroups: [{ $group: { _id: '$workflowStatusId', count: { $sum: 1 } } }, { $lookup: { from: 'pts_task_workflow_statuses', localField: '_id', foreignField: '_id', as: 'status' } }, { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } }, { $project: { _id: 0, id: { $toString: '$_id' }, count: 1, name: '$status.name', key: '$status.key', category: '$status.category', color: '$status.color' } }],
      projectGroups: [{ $group: { _id: '$projectId', count: { $sum: 1 } } }, { $project: { _id: 0, id: { $toString: '$_id' }, count: 1 } }],
      priorityGroups: [{ $group: { _id: '$priority', count: { $sum: 1 } } }, { $project: { _id: 0, key: '$_id', count: 1 } }],
      personGroups: [{ $group: { _id: { $ifNull: ['$primaryAssigneeId', { $arrayElemAt: ['$assignees.userId', 0] }] }, count: { $sum: 1 } } }, { $project: { _id: 0, id: { $cond: [{ $eq: ['$_id', null] }, 'unassigned', { $toString: '$_id' }] }, count: 1 } }],
      dueGroups: [{ $group: { _id: { $switch: { branches: [
        { case: { $eq: ['$dueDate', null] }, then: 'none' },
        { case: { $lt: ['$dueDate', now] }, then: 'overdue' },
        { case: { $and: [{ $gte: ['$dueDate', start] }, { $lt: ['$dueDate', end] }] }, then: 'today' },
      ], default: 'upcoming' } }, count: { $sum: 1 } } }, { $project: { _id: 0, key: '$_id', count: 1 } }],
    } }]);
  const facets = summaryRows[0] || {};
  const count = (key) => Number(facets[key]?.[0]?.count || 0);
  const items = facets.items || [];
  const total = count('total');
  const personIds = (facets.personGroups || []).map((row) => row.id).filter((id) => id && id !== 'unassigned');
  const groupUsers = personIds.length ? await resolveUsersByIds(personIds) : {};
  const personGroups = (facets.personGroups || []).map((row) => ({
    ...row,
    name: row.id === 'unassigned' ? 'Unassigned' : displayName(groupUsers[String(row.id)]),
    email: row.id === 'unassigned' ? '' : (groupUsers[String(row.id)]?.email || ''),
  }));
  return { items: await enrichSummaries(items, context), pagination: buildPaginationMeta({ ...pagination, total }),
    summary: context.summaryMatch ? { active: count('active'), overdue: count('overdue'), dueToday: count('dueToday'), critical: count('critical'), blocked: count('blocked'), blockedSupported: Boolean(context.blockedIds?.length), unassigned: count('unassigned') } : undefined,
    groupCounts: context.summaryMatch ? { statuses: facets.statusGroups || [], projects: facets.projectGroups || [], priorities: facets.priorityGroups || [], people: personGroups, due: facets.dueGroups || [] } : undefined };
}

module.exports = { buildMatch, dueRange, isUnassignedCondition, assigneeCondition, isSuperAdminRequest, projectPersonalScopeCondition, assigneeSummaries, enrichSummaries, listMyWork, listTeamWork };
