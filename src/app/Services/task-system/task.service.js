const Task = require('../../MongoModels/task.model');
const TaskPlacement = require('../../MongoModels/task_placement.model');
const ProjectMember = require('../../MongoModels/project_member.model');
const WorkspaceNode = require('../../MongoModels/workspace_node.model');
const List = require('../../MongoModels/list.model');
const { AccountAdmin, CoreProject, CoreUser } = require('../../MongoModels');
const { ensureInboxExists } = require('./list.service');
const { syncProjectMembers } = require('./project_member.service');
const { createNotification } = require('./notification.service');
const { sendToUser } = require('./socket.service');
const { syncUserProjects } = require('../../Repositories/workspace.repository');

const TASK_CARD_PROJECTION = {
  title: 1,
  status: 1,
  priority: 1,
  dueDate: 1,
  tags: 1,
  workspaceNodeId: 1,
  workspaceNodeType: 1,
  ownerUserId: 1,
  workspaceOwnerId: 1,
  projectId: 1,
  projectRef: 1,
  createdBy: 1,
  assignees: 1,
  visibility: 1,
  createdAt: 1,
  updatedAt: 1,
};

function buildLogEntry(action, performedBy, meta = {}) {
  return { action, performedBy, meta, timestamp: new Date() };
}

async function normalizeChecklistItem(item, index, actorUserId) {
  const id = String(item.id || item._id || `${Date.now()}-${index}`);
  const createdBy = (await resolveTaskAccount(item.createdBy || actorUserId))._id;
  const completedBy = item.completedBy ? (await resolveTaskAccount(item.completedBy))._id : null;
  return {
    id,
    text: String(item.text || '').trim(),
    isCompleted: Boolean(item.isCompleted),
    createdBy,
    completedBy,
    completedAt: item.completedAt ? new Date(item.completedAt) : null,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1,
    createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
  };
}

async function normalizeCommentItem(item, index, actorUserId, userDirectory = {}) {
  const id = String(item.id || item._id || `${Date.now()}-${index}`);
  const rawUserId = item.userId || item.user_id || item.createdBy || actorUserId;
  const userId = (await resolveTaskAccount(rawUserId))._id;
  const mentions = Array.isArray(item.mentions)
    ? (await Promise.all(item.mentions.filter(Boolean).map((mentionId) => resolveTaskAccount(mentionId))))
      .map((account) => account._id)
    : [];
  return {
    id,
    text: String(item.text || item.body || item.message || '').trim(),
    userId,
    userName: String(item.userName || item.authorName || userDirectory[String(rawUserId)]?.name || userDirectory[String(userId)]?.name || ''),
    mentions,
    createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
    isEdited: Boolean(item.isEdited),
    editedAt: item.editedAt ? new Date(item.editedAt) : null,
    isDeleted: Boolean(item.isDeleted),
    deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
    deletedBy: item.deletedBy || null,
  };
}

async function getProjectMembersRaw(projectSourceId) {
  return ProjectMember.find({ 'projectRef.sourceId': Number(projectSourceId), isActive: true }).lean();
}

async function validateAssignees(assigneeRefs, projectSourceId) {
  await syncProjectMembers(projectSourceId);
  const members = await getProjectMembersRaw(projectSourceId);
  const memberUserIds = members.map((m) => String(m.userId));

  for (const assignee of assigneeRefs) {
    const id = assignee?._id || assignee;
    if (assignee?.accountType === 'admin') continue;
    if (!memberUserIds.includes(String(id))) {
      const err = new Error(`User ${id} is not a member of this project`);
      err.status = 400;
      throw err;
    }
  }

  return true;
}

function serviceError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isMongoId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

async function resolveCoreUserId(value, label = 'userId') {
  if (!value) throw serviceError(`${label} is required`, 400);
  const raw = typeof value === 'object' && value !== null && value._id ? value._id : value;
  const query = isMongoId(raw) ? { _id: raw } : { legacyId: Number(raw) };
  if (!query._id && !Number.isFinite(query.legacyId)) throw serviceError(`Invalid ${label}`, 400);

  const user = await CoreUser.findOne({ ...query, isDeleted: false }, { _id: 1 }).lean();
  if (!user) throw serviceError(`User ${value} was not found`, 404);
  return user._id;
}

async function resolveTaskAccount(value, label = 'userId') {
  if (!value) throw serviceError(`${label} is required`, 400);
  const rawValue = typeof value === 'object' && value !== null && value._id ? value._id : value;
  const raw = String(rawValue);
  const prefixed = raw.match(/^(admin|user):(.+)$/i);
  const requestedType = prefixed ? prefixed[1].toLowerCase() : null;
  const idValue = prefixed ? prefixed[2] : raw;
  const query = isMongoId(idValue) ? { _id: idValue } : { legacyId: Number(idValue) };
  if (!query._id && !Number.isFinite(query.legacyId)) throw serviceError(`Invalid ${label}`, 400);

  if (requestedType === 'admin') {
    const admin = await AccountAdmin.findOne({ ...query, isDeleted: false }, { _id: 1, legacyId: 1, name: 1, email: 1 }).lean();
    if (!admin) throw serviceError(`Admin ${idValue} was not found`, 404);
    return { _id: admin._id, accountType: 'admin', legacyId: admin.legacyId };
  }

  if (requestedType === 'user') {
    const user = await CoreUser.findOne({ ...query, isDeleted: false }, { _id: 1, legacyId: 1 }).lean();
    if (!user) throw serviceError(`User ${idValue} was not found`, 404);
    return { _id: user._id, accountType: 'user', legacyId: user.legacyId };
  }

  const user = await CoreUser.findOne({ ...query, isDeleted: false }, { _id: 1, legacyId: 1 }).lean();
  if (user) return { _id: user._id, accountType: 'user', legacyId: user.legacyId };

  const admin = await AccountAdmin.findOne({ ...query, isDeleted: false }, { _id: 1, legacyId: 1 }).lean();
  if (admin) return { _id: admin._id, accountType: 'admin', legacyId: admin.legacyId };

  throw serviceError(`User ${idValue} was not found`, 404);
}

async function resolveTaskAccounts(values = [], label = 'userId') {
  const raw = [...new Set((values || []).map(String).filter(Boolean))];
  const resolved = [];
  for (const value of raw) resolved.push(await resolveTaskAccount(value, label));
  return [...new Map(resolved.map((item) => [String(item._id), item])).values()];
}

async function assertAssignableAccounts(accountRefs = [], label = 'assigneeId') {
  const refs = Array.isArray(accountRefs) ? accountRefs : [];
  if (!refs.length) return refs;

  const userIds = refs.filter((ref) => ref.accountType !== 'admin').map((ref) => ref._id);
  const adminIds = refs.filter((ref) => ref.accountType === 'admin').map((ref) => ref._id);
  const [activeUsers, activeAdmins] = await Promise.all([
    userIds.length
      ? CoreUser.find({ _id: { $in: userIds }, isDeleted: false, isActive: true }, { _id: 1 }).lean()
      : [],
    adminIds.length
      ? AccountAdmin.find({ _id: { $in: adminIds }, isDeleted: false, isActive: true }, { _id: 1 }).lean()
      : [],
  ]);

  const activeUserIds = new Set(activeUsers.map((user) => String(user._id)));
  const activeAdminIds = new Set(activeAdmins.map((admin) => String(admin._id)));
  const inactive = refs.find((ref) => (
    ref.accountType === 'admin'
      ? !activeAdminIds.has(String(ref._id))
      : !activeUserIds.has(String(ref._id))
  ));

  if (inactive) {
    throw serviceError(`Invalid ${label}: user is inactive or unavailable`, 400);
  }

  return refs;
}

function logAssignmentFailure(context, err) {
  console.error('[task-assignment] failed', {
    ...context,
    status: err?.status || 500,
    message: err?.message || String(err),
  });
}

function canManageProjectTasks(auth = {}) {
  const permissions = auth.permissions || [];
  const roles = (auth.roles || []).map((role) => String(role).toUpperCase());
  return auth.accountType === 'admin' ||
    permissions.includes('tasks.assign') ||
    permissions.includes('tasks.update_all') ||
    roles.includes('SUPER_ADMIN') ||
    roles.includes('ADMIN') ||
    roles.includes('MANAGER');
}

async function assertProjectCanAcceptTasks(actorUserId, projectSourceId, assigneeRefs = [], auth = {}) {
  const project = await CoreProject.findOne({ legacyId: Number(projectSourceId) }).lean();

  if (!project || project.isDeleted || !Boolean(project.isActive) || project.status !== 'active') {
    throw serviceError('This project is not active. Existing tasks remain visible, but new tasks are disabled.', 409);
  }

  await syncProjectMembers(projectSourceId);
  const members = await getProjectMembersRaw(projectSourceId);
  const memberUserIds = members.map((m) => String(m.userId));
  const isPrivileged = canManageProjectTasks(auth);

  if (!isPrivileged && !memberUserIds.includes(String(actorUserId))) {
    throw serviceError('You can only create tasks in active projects assigned to you.', 403);
  }

  for (const assignee of assigneeRefs) {
    if (assignee.accountType === 'admin') continue;
    const id = assignee._id;
    if (!memberUserIds.includes(String(id))) {
      throw serviceError(`User ${id} is not assigned to this active project`, 400);
    }
  }

  return project;
}

function sameId(a, b) {
  return String(a || '') === String(b || '');
}

function taskParticipantIds(task) {
  return Array.from(new Set([
    task.createdBy ? String(task.createdBy) : null,
    ...(task.assignees || []).map((a) => a.userId ? String(a.userId) : null),
  ].filter(Boolean)));
}

function listChangedItems(previousItems = [], nextItems = [], idKey = 'id') {
  const previousIds = new Set(previousItems.map((item) => String(item[idKey] || item._id)));
  return nextItems.filter((item) => !previousIds.has(String(item[idKey] || item._id)));
}

function userDisplayName(user) {
  if (!user) return '';
  return String(
    user.name
    || `${user.firstName || user.first_name || ''} ${user.lastName || user.last_name || ''}`.trim()
    || user.userName
    || user.user_name
    || user.email
    || `User ${user.legacyId || user.id}`
  ).trim();
}

async function getUserDirectory(userIds = []) {
  const raw = [...new Set((userIds || []).filter(Boolean).map((id) => String(id)))];
  if (!raw.length) return {};

  const mongoIds = raw.filter((id) => /^[a-f\d]{24}$/i.test(id));
  const legacyIds = raw.filter((id) => !/^[a-f\d]{24}$/i.test(id)).map(Number).filter(Boolean);

  const queries = [];
  if (mongoIds.length) queries.push({ _id: { $in: mongoIds } });
  if (legacyIds.length) queries.push({ legacyId: { $in: legacyIds } });
  if (!queries.length) return {};

  const [users, admins] = await Promise.all([
    CoreUser.find(
    queries.length === 1 ? queries[0] : { $or: queries },
    { _id: 1, legacyId: 1, firstName: 1, lastName: 1, userName: 1, email: 1 }
    ).lean(),
    AccountAdmin.find(
      queries.length === 1 ? queries[0] : { $or: queries },
      { _id: 1, legacyId: 1, name: 1, email: 1, type: 1 }
    ).lean(),
  ]);

  const directory = users.reduce((acc, user) => {
    const entry = { id: String(user.legacyId), name: userDisplayName(user), email: user.email || '' };
    acc[String(user._id)] = entry;
    if (user.legacyId) acc[String(user.legacyId)] = entry;
    return acc;
  }, {});
  admins.forEach((admin) => {
    const entry = {
      id: `admin:${admin.legacyId}`,
      name: userDisplayName(admin) || 'Admin',
      email: admin.email || '',
      accountType: 'admin',
    };
    directory[String(admin._id)] = entry;
    if (admin.legacyId) directory[`admin:${admin.legacyId}`] = entry;
  });
  return directory;
}

function collectTaskUserIds(taskLike, target = new Set()) {
  if (!taskLike) return target;
  const task = taskLike.toObject ? taskLike.toObject() : taskLike;
  [
    task.createdBy,
    task.completedBy,
    ...(task.assignees || []).map((a) => a?.userId),
    ...(task.comments || []).map((c) => c?.userId || c?.user_id || c?.createdBy),
    ...(task.logs || []).map((l) => l?.performedBy || l?.userId || l?.triggeredBy),
  ].filter(Boolean).forEach((id) => target.add(String(id)));
  return target;
}

function enrichTaskWithDirectory(taskLike, directory = {}) {
  if (!taskLike) return taskLike;
  const task = taskLike.toObject ? taskLike.toObject() : { ...taskLike };

  task.createdByName = directory[String(task.createdBy)]?.name || '';
  task.createdByUserId = directory[String(task.createdBy)]?.id || task.createdBy;
  task.assigneeIds = (task.assignees || [])
    .map((assignee) => directory[String(assignee?.userId)]?.id || assignee?.userId)
    .filter(Boolean)
    .map(String);
  task.assignees = (task.assignees || []).map((assignee) => {
    const info = directory[String(assignee?.userId)] || {};
    return {
      ...assignee,
      id: assignee?.id || info.id || '',
      user_id: assignee?.user_id || info.id || '',
      name: assignee?.name || info.name || '',
      userName: assignee?.userName || info.name || '',
      email: assignee?.email || info.email || '',
    };
  });
  task.comments = (task.comments || []).map((comment) => {
    const info = directory[String(comment?.userId || comment?.user_id || comment?.createdBy)] || {};
    return { ...comment, userName: comment?.userName || comment?.authorName || info.name || '', authorName: comment?.authorName || comment?.userName || info.name || '' };
  });
  task.logs = (task.logs || []).map((log) => {
    const actorId = String(log?.performedBy || log?.userId || log?.triggeredBy || '');
    const assigneeId = String(log?.meta?.assigneeId || log?.meta?.targetUserId || log?.meta?.userId || log?.meta?.removedUserId || '');
    const actor = directory[actorId];
    const assignee = directory[assigneeId];
    return {
      ...log,
      performedByName: log?.performedByName || actor?.name || '',
      meta: {
        ...(log?.meta || {}),
        actorName: log?.meta?.actorName || actor?.name || '',
        assigneeName: log?.meta?.assigneeName || assignee?.name || '',
        targetUserName: log?.meta?.targetUserName || assignee?.name || '',
      },
    };
  });
  return task;
}

async function enrichTaskPayload(taskLike) {
  const userIds = collectTaskUserIds(taskLike);
  const directory = await getUserDirectory(Array.from(userIds));
  return enrichTaskWithDirectory(taskLike, directory);
}

async function enrichTaskPayloads(taskLikes = []) {
  const userIds = new Set();
  taskLikes.forEach((task) => collectTaskUserIds(task, userIds));
  const directory = await getUserDirectory(Array.from(userIds));
  return taskLikes.map((task) => enrichTaskWithDirectory(task, directory));
}

async function notifyTaskParticipants(task, actorUserId, options) {
  const { type, socketEvent, message, payload = {}, onlyUsers = null } = options;
  const participantIds = onlyUsers || taskParticipantIds(task);
  const actorDirectory = await getUserDirectory([actorUserId]);
  const actorName = actorDirectory[String(actorUserId)]?.name || '';
  const enrichedTask = await enrichTaskPayload(task);

  for (const userId of participantIds) {
    if (!userId || String(userId) === String(actorUserId)) continue;

    const placement = await TaskPlacement.findOne({ taskId: task._id, userId }).lean();
    const workspaceNodeId = placement?.workspaceNodeId || task.workspaceNodeId;
    const notification = await createNotification({
      userId,
      type,
      taskId: task._id,
      taskTitle: task.title,
      projectId: task.projectId || null,
      workspaceNodeId,
      triggeredBy: actorUserId,
      triggeredByName: actorName,
      message,
    });

    sendToUser(userId, socketEvent, {
      ...payload,
      notification,
      taskId: String(task._id),
      task: enrichedTask,
      workspaceNodeId: workspaceNodeId ? String(workspaceNodeId) : null,
      projectId: task.projectRef?.sourceId || null,
      triggeredBy: actorUserId,
      triggeredByName: actorName,
    });
  }
}

async function resolveProjectRefForNode(node) {
  if (node?.projectRef?.sourceId) {
    return { sourceId: Number(node.projectRef.sourceId), sourceType: node.projectRef.sourceType || 'mongodb' };
  }
  if (!node?.rootProjectId) return { sourceId: null, sourceType: 'mongodb' };
  const root = await WorkspaceNode.findOne({ _id: node.rootProjectId, deletedAt: null }).lean();
  return {
    sourceId: root?.projectRef?.sourceId ? Number(root.projectRef.sourceId) : null,
    sourceType: root?.projectRef?.sourceType || 'mongodb',
  };
}

async function findOrCreateUserProjectNode(userId, sourceNode, projectRef) {
  if (!projectRef?.sourceId) return sourceNode;

  let project = null;
  let user = null;
  let projectName = sourceNode.name;
  try {
    [project, user] = await Promise.all([
      CoreProject.findOne({ legacyId: Number(projectRef.sourceId) }).lean(),
      CoreUser.findOne({ _id: userId }, { legacyId: 1 }).lean(),
    ]);
    projectName = project?.title || projectName;
  } catch {
    projectName = sourceNode.name;
  }

  const node = await WorkspaceNode.findOneAndUpdate(
    { userId, 'projectRef.sourceId': Number(projectRef.sourceId) },
    {
      $set: {
        userId,
        projectId: project?._id || null,
        legacyUserId: user?.legacyId || null,
        name: projectName,
        type: 'project',
        depth: 0,
        parentId: null,
        rootProjectId: null,
        isUserCreated: false,
        deletedAt: null,
        'projectRef.sourceId': Number(projectRef.sourceId),
        'projectRef.sourceType': projectRef.sourceType || 'mongodb',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await ensureInboxExists(userId, node._id);
  return node;
}

async function findOrCreateSharedWithMeNode(userId) {
  const user = await CoreUser.findOne({ _id: userId }, { legacyId: 1 }).lean();
  const node = await WorkspaceNode.findOneAndUpdate(
    { userId, type: 'folder', name: 'Assigned to Me', isUserCreated: false, deletedAt: null },
    {
      $setOnInsert: {
        userId,
        legacyUserId: user?.legacyId || null,
        name: 'Assigned to Me',
        type: 'folder',
        depth: 0,
        parentId: null,
        rootProjectId: null,
        projectId: null,
        isUserCreated: false,
        icon: 'ri-checkbox-line',
        color: '#10B981',
        order: 0,
      },
      $set: { deletedAt: null },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await ensureInboxExists(userId, node._id);
  return node.toObject ? node.toObject() : node;
}

async function resolveUserNodeForTask(userId, sourceNode) {
  const projectRef = await resolveProjectRefForNode(sourceNode);
  if (projectRef.sourceId) return findOrCreateUserProjectNode(userId, sourceNode, projectRef);
  if (sameId(sourceNode.userId, userId)) return sourceNode;
  return findOrCreateSharedWithMeNode(userId);
}

async function nextPlacementOrder(userId, listId) {
  const latest = await TaskPlacement.findOne({ userId, listId }).sort({ order: -1 }).lean();
  return latest ? Number(latest.order || 0) + 1024 : 1024;
}

async function resolvePlacementList(userId, nodeId, requestedListId = null) {
  if (requestedListId) {
    const list = await List.findOne({
      _id: requestedListId,
      userId,
      workspaceNodeId: nodeId,
      isArchived: false,
    }).lean();
    if (!list) throw serviceError('Selected list is not available for this board', 400);
    return list;
  }

  return ensureInboxExists(userId, nodeId);
}

async function ensureUserPlacement(task, userId, sourceNode, preferredNode = null, requestedListId = null) {
  const targetNode = preferredNode || await resolveUserNodeForTask(userId, sourceNode);
  const targetList = await resolvePlacementList(userId, targetNode._id, requestedListId);
  const existing = await TaskPlacement.findOne({ taskId: task._id, userId });

  if (existing) {
    const existingList = await List.findOne({
      _id: existing.listId,
      userId,
      workspaceNodeId: targetNode._id,
      isArchived: false,
    }).lean();

    if (sameId(existing.workspaceNodeId, targetNode._id) && existingList && !requestedListId) return existing.toObject();

    existing.workspaceNodeId = targetNode._id;
    existing.listId = targetList._id;
    existing.order = await nextPlacementOrder(userId, targetList._id);
    existing.placedAt = new Date();
    await existing.save();
    return existing.toObject();
  }

  const placement = await TaskPlacement.create({
    taskId: task._id,
    userId,
    workspaceNodeId: targetNode._id,
    listId: targetList._id,
    order: await nextPlacementOrder(userId, targetList._id),
  });

  return placement.toObject();
}

async function createTask(actorUserId, workspaceNodeId, data, auth = {}) {
  const { title, description, tags, priority, dueDate, startDate, assigneeIds = [], listId = null } = data;

  if (!title || !title.trim()) throw serviceError('title is required');

  const node = await WorkspaceNode.findOne({ _id: workspaceNodeId, deletedAt: null });
  if (!node) throw serviceError('Workspace not found', 404);

  const projectRef = await resolveProjectRefForNode(node);
  const uniqueAssigneeRefs = await resolveTaskAccounts(assigneeIds, 'assigneeId');
  await assertAssignableAccounts(uniqueAssigneeRefs, 'assigneeId');
  const uniqueAssigneeIds = uniqueAssigneeRefs.map((assignee) => assignee._id);
  let project = null;

  if (projectRef.sourceId) {
    project = await assertProjectCanAcceptTasks(actorUserId, projectRef.sourceId, uniqueAssigneeRefs, auth);
  }
  if (listId) {
    await resolvePlacementList(actorUserId, node._id, listId);
  }

  const now = new Date();
  const actorDirectory = await getUserDirectory([actorUserId, ...uniqueAssigneeIds]);
  const actorName = actorDirectory[String(actorUserId)]?.name || '';
  const assignees = uniqueAssigneeIds.map((userId) => ({ userId, assignedAt: now, assignedBy: actorUserId }));

  const task = await Task.create({
    workspaceNodeId: node._id,
    workspaceNodeType: node.type,
    ownerUserId: node.userId || actorUserId,
    workspaceOwnerId: node.userId || actorUserId,
    projectId: project?._id || node.projectId || null,
    projectRef: { sourceId: projectRef.sourceId, sourceType: projectRef.sourceType || 'mongodb' },
    title: title.trim(),
    description: description || '',
    tags: Array.isArray(tags) ? tags : [],
    priority: priority || 'none',
    dueDate: dueDate || null,
    startDate: startDate || null,
    createdBy: actorUserId,
    assignees,
    watchers: [],
    visibility: projectRef.sourceId ? 'project' : (uniqueAssigneeIds.some((id) => !sameId(id, actorUserId)) ? 'shared' : 'private'),
    logs: [buildLogEntry('created', actorUserId, { title: title.trim() })],
  });

  const placementUserIds = [...new Set([String(actorUserId), ...uniqueAssigneeIds])];

  for (const userId of placementUserIds) {
    await ensureUserPlacement(task, userId, node, null, sameId(userId, actorUserId) ? listId : null);
  }

  for (const userId of uniqueAssigneeIds) {
    if (String(userId) === String(actorUserId)) continue;

    const targetNode = await resolveUserNodeForTask(userId, node);
    await createNotification({
      userId,
      type: 'task_assigned',
      taskId: task._id,
      taskTitle: task.title,
      projectId: task.projectId || null,
      workspaceNodeId: targetNode._id,
      workspaceNodeName: targetNode.name,
      triggeredBy: actorUserId,
      triggeredByName: actorName,
      message: `You have been assigned to "${task.title}"`,
    });
  }

  return enrichTaskPayload(task);
}

async function getTask(taskId) {
  const task = await Task.findOne({ _id: taskId, status: { $ne: 'archived' } }).lean();
  if (!task) throw serviceError('Task not found', 404);
  return enrichTaskPayload(task);
}

async function getAssignableUsersForNode(actorUserId, workspaceNodeId, auth = {}) {
  const node = await WorkspaceNode.findOne({ _id: workspaceNodeId, deletedAt: null }).lean();
  if (!node) throw serviceError('Workspace not found', 404);

  const projectRef = await resolveProjectRefForNode(node);
  const users = [];

  if (projectRef.sourceId) {
    await syncProjectMembers(projectRef.sourceId);
    const members = await getProjectMembersRaw(projectRef.sourceId);
    const allowedMemberIds = members.map((member) => member.userId);

    if (allowedMemberIds.length) {
      const memberUsers = await CoreUser.find(
        { _id: { $in: allowedMemberIds }, isDeleted: false, isActive: true },
        { _id: 1, legacyId: 1, firstName: 1, lastName: 1, userName: 1, email: 1 }
      ).lean();
      users.push(...memberUsers.map((user) => ({
        id: String(user.legacyId),
        accountType: 'user',
        name: userDisplayName(user),
        email: user.email || '',
      })));
    }
  } else {
    const activeUsers = await CoreUser.find(
      { isDeleted: false, isActive: true },
      { _id: 1, legacyId: 1, firstName: 1, lastName: 1, userName: 1, email: 1 }
    ).lean();
    users.push(...activeUsers.map((user) => ({
      id: String(user.legacyId),
      accountType: 'user',
      name: userDisplayName(user),
      email: user.email || '',
    })));
  }

  const admins = await AccountAdmin.find(
    { isDeleted: false, isActive: true },
    { _id: 1, legacyId: 1, name: 1, email: 1 }
  ).lean();

  users.push(...admins.map((admin) => ({
    id: `admin:${admin.legacyId}`,
    accountType: 'admin',
    name: userDisplayName(admin) || 'Admin',
    email: admin.email || '',
  })));

  return [...new Map(users.filter((user) => user.id).map((user) => [user.id, user])).values()];
}

async function getTasksForNode(workspaceNodeId, filters = {}) {
  const query = { workspaceNodeId, status: { $ne: 'archived' } };
  if (filters.priority) query.priority = filters.priority;
  if (filters.assigneeUserId) query['assignees.userId'] = filters.assigneeUserId;
  if (filters.createdBy) query.createdBy = filters.createdBy;
  return Task.find(query).lean();
}

async function buildUserTaskVisibilityFilter(userId) {
  const rawId = String(userId || '');
  const objectIds = new Set(/^[a-f\d]{24}$/i.test(rawId) ? [rawId] : []);
  const adminLegacyMatch = rawId.match(/^admin:(\d+)$/i);
  const legacyId = adminLegacyMatch ? Number(adminLegacyMatch[1]) : Number(rawId);
  const userQueries = [];
  const adminQueries = [];

  if (/^[a-f\d]{24}$/i.test(rawId)) userQueries.push({ _id: rawId });
  if (/^[a-f\d]{24}$/i.test(rawId)) adminQueries.push({ _id: rawId });
  if (Number.isFinite(legacyId) && legacyId > 0) {
    userQueries.push({ legacyId });
    adminQueries.push({ legacyId });
  }

  if (userQueries.length || adminQueries.length) {
    const [user, admin] = await Promise.all([
      userQueries.length
        ? CoreUser.findOne({ $or: userQueries }, { _id: 1, legacyId: 1 }).lean()
        : null,
      adminQueries.length
        ? AccountAdmin.findOne({ $or: adminQueries }, { _id: 1, legacyId: 1 }).lean()
        : null,
    ]);

    if (user?._id) objectIds.add(String(user._id));
    if (admin?._id) objectIds.add(String(admin._id));
  }

  const candidates = Array.from(objectIds).filter((id) => /^[a-f\d]{24}$/i.test(id));
  if (!candidates.length) return { _id: null };

  return {
    $or: [
      { createdBy: { $in: candidates } },
      { 'assignees.userId': { $in: candidates } },
      { workspaceOwnerId: { $in: candidates } },
      { ownerUserId: { $in: candidates } },
    ],
  };
}

async function getWorkspaceTaskSummary(actorUserId, auth = {}, options = {}) {
  const isAdmin = canManageProjectTasks(auth);
  const targetUserId = isAdmin && options.viewAsUserId ? options.viewAsUserId : actorUserId;
  const taskQuery = { status: { $ne: 'archived' } };
  const limit = Math.min(Math.max(Number(options.limit || 200), 1), 500);

  if (!isAdmin || options.viewAsUserId) {
    Object.assign(taskQuery, await buildUserTaskVisibilityFilter(targetUserId));
  }

  const tasks = await Task.find(taskQuery, TASK_CARD_PROJECTION)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const userIds = new Set();
  tasks.forEach((task) => {
    if (task.createdBy) userIds.add(String(task.createdBy));
    (task.assignees || []).forEach((assignee) => {
      if (assignee?.userId) userIds.add(String(assignee.userId));
    });
  });
  const directory = await getUserDirectory(Array.from(userIds));

  return tasks.map((task) => ({
    _id: String(task._id),
    id: String(task._id),
    title: task.title || 'Untitled Task',
    status: task.status,
    isCompleted: task.status === 'completed',
    priority: task.priority || 'none',
    dueDate: task.dueDate || null,
    workspaceNodeId: task.workspaceNodeId ? String(task.workspaceNodeId) : '',
    projectId: task.projectId ? String(task.projectId) : null,
    projectRef: task.projectRef || null,
    createdBy: directory[String(task.createdBy)]?.id || task.createdBy,
    createdByUserId: directory[String(task.createdBy)]?.id || task.createdBy,
    assigneeIds: (task.assignees || [])
      .map((assignee) => directory[String(assignee?.userId)]?.id || assignee?.userId)
      .filter(Boolean)
      .map(String),
  }));
}

async function getUserTasksInNode(userId, workspaceNodeId, auth = {}) {
  const node = await WorkspaceNode.findOne({ _id: workspaceNodeId, userId, deletedAt: null }).lean();
  if (!node) throw serviceError('Workspace not found', 404);

  const projectRef = await resolveProjectRefForNode(node);
  const inbox = await ensureInboxExists(userId, node._id);
  const isAdmin = canManageProjectTasks(auth);
  const shouldScopeToOwnTasks = !isAdmin || auth.accountType === 'admin';

  const filters = [{ status: { $ne: 'archived' } }];
  if (projectRef.sourceId) {
    const project = await CoreProject.findOne({ legacyId: Number(projectRef.sourceId) }, { _id: 1 }).lean();
    filters.push({
      $or: [
        { 'projectRef.sourceId': Number(projectRef.sourceId) },
        ...(project?._id ? [{ projectId: project._id }] : []),
        { workspaceNodeId },
      ],
    });
  } else {
    const placementTaskIds = await TaskPlacement.distinct('taskId', { userId, workspaceNodeId });
    filters.push({
      $or: [
        { workspaceNodeId },
        ...(placementTaskIds.length ? [{ _id: { $in: placementTaskIds } }] : []),
      ],
    });
  }
  if (shouldScopeToOwnTasks) filters.push({ $or: [{ 'assignees.userId': userId }, { createdBy: userId }] });

  const taskQuery = filters.length === 1 ? filters[0] : { $and: filters };

  const tasks = await Task.find(taskQuery, TASK_CARD_PROJECTION)
    .sort({ updatedAt: -1 })
    .limit(250)
    .lean();
  const taskIds = tasks.map((task) => task._id);
  const placements = await TaskPlacement.find({ userId, taskId: { $in: taskIds } }).lean();
  const placementMap = {};
  placements.forEach((p) => { placementMap[String(p.taskId)] = p; });

  const grouped = {};
  for (const task of tasks) {
    let placement = placementMap[String(task._id)];

    if (!placement || !sameId(placement.workspaceNodeId, node._id)) {
      placement = await ensureUserPlacement(task, userId, node, node);
    }

    const listIdStr = String(placement.listId || inbox._id);
    task.listId = placement.listId;
    task.order = placement.order;
    if (!grouped[listIdStr]) grouped[listIdStr] = [];
    grouped[listIdStr].push(task);
  }

  for (const listId of Object.keys(grouped)) {
    grouped[listId].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  const enrichedTasks = await enrichTaskPayloads(tasks);
  const enrichedById = enrichedTasks.reduce((acc, task) => { acc[String(task._id)] = task; return acc; }, {});

  const enrichedGrouped = {};
  Object.keys(grouped).forEach((listId) => {
    enrichedGrouped[listId] = grouped[listId]
      .map((task) => enrichedById[String(task._id)] || task)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  });

  return enrichedGrouped;
}

// Admin views a specific employee's task board for the project that the admin's node belongs to.
async function getAdminViewOfUserBoard(adminUserId, adminNodeId, targetUserId, auth) {
  if (!canManageProjectTasks(auth)) throw serviceError('Not authorized to view other users\' boards', 403);

  const adminNode = await WorkspaceNode.findOne({ _id: adminNodeId, deletedAt: null }).lean();
  if (!adminNode) throw serviceError('Workspace not found', 404);

  const projectRef = await resolveProjectRefForNode(adminNode);
  if (!projectRef.sourceId) throw serviceError('No project associated with this node', 404);

  // Ensure target user has workspace nodes synced (they may not have loaded the board yet)
  const targetCoreUserId = await resolveCoreUserId(targetUserId);
  let targetNode = await WorkspaceNode.findOne({ userId: targetCoreUserId, 'projectRef.sourceId': projectRef.sourceId, deletedAt: null }).lean();
  if (!targetNode) {
    await syncUserProjects(targetCoreUserId, {});
    targetNode = await WorkspaceNode.findOne({ userId: targetCoreUserId, 'projectRef.sourceId': projectRef.sourceId, deletedAt: null }).lean();
  }
  if (!targetNode) throw serviceError('This user is not assigned to the project. Assign them first.', 404);

  return getUserTasksInNode(targetCoreUserId, targetNode._id, {});
}

async function updateTask(actorUserId, taskId, data) {
  const task = await Task.findOne({ _id: taskId });
  if (!task) throw serviceError('Task not found', 404);

  const previousTags = [...(task.tags || [])];
  const previousChecklist = (task.checklist || []).map((item) => item.toObject ? item.toObject() : item);
  const previousComments = (task.comments || []).map((item) => item.toObject ? item.toObject() : item);
  const notificationJobs = [];
  const userDirectory = await getUserDirectory([
    actorUserId,
    task.createdBy,
    ...(task.assignees || []).map((a) => a?.userId),
    ...((data.comments || []).map((c) => c?.userId || c?.user_id || c?.createdBy)),
  ].filter(Boolean).map(String));
  const actorName = userDirectory[String(actorUserId)]?.name || '';

  if (data.priority !== undefined && data.priority !== task.priority) {
    task.logs.push(buildLogEntry('priority_changed', actorUserId, { from: task.priority, to: data.priority }));
    task.priority = data.priority;
    notificationJobs.push({ type: 'task_updated', socketEvent: 'task_updated', message: `"${task.title}" priority was updated`, payload: { field: 'priority' } });
  }

  if (data.dueDate !== undefined) {
    const incoming = data.dueDate ? new Date(data.dueDate) : null;
    const existing = task.dueDate ? task.dueDate.toISOString() : null;
    if (existing !== (incoming ? incoming.toISOString() : null)) {
      task.logs.push(buildLogEntry('due_date_changed', actorUserId, { from: task.dueDate, to: incoming }));
      task.dueDate = incoming;
      notificationJobs.push({ type: 'task_updated', socketEvent: 'task_updated', message: `"${task.title}" due date was updated`, payload: { field: 'dueDate' } });
    }
  }

  if (data.title !== undefined && data.title.trim() !== task.title) {
    const previousTitle = task.title;
    task.logs.push(buildLogEntry('updated', actorUserId, { field: 'title', from: task.title, to: data.title.trim() }));
    task.title = data.title.trim();
    notificationJobs.push({ type: 'task_updated', socketEvent: 'task_updated', message: `"${previousTitle}" was renamed to "${task.title}"`, payload: { field: 'title' } });
  }

  if (data.description !== undefined && data.description !== task.description) {
    task.logs.push(buildLogEntry('updated', actorUserId, { field: 'description', from: task.description, to: data.description }));
    task.description = data.description;
    notificationJobs.push({ type: 'task_updated', socketEvent: 'task_updated', message: `"${task.title}" description was updated`, payload: { field: 'description' } });
  }

  if (data.tags !== undefined) {
    task.tags = Array.isArray(data.tags) ? data.tags : [];
    if (previousTags.join('|') !== task.tags.join('|')) {
      task.logs.push(buildLogEntry('updated', actorUserId, { field: 'tags', from: previousTags, to: task.tags }));
      notificationJobs.push({ type: 'task_updated', socketEvent: 'task_updated', message: `"${task.title}" tags were updated`, payload: { field: 'tags' } });
    }
  }

  if (data.startDate !== undefined) task.startDate = data.startDate ? new Date(data.startDate) : null;

  if (data.assigneeIds !== undefined) {
    const nextAssigneeRefs = await resolveTaskAccounts(Array.isArray(data.assigneeIds) ? data.assigneeIds : [], 'assigneeId');
    await assertAssignableAccounts(nextAssigneeRefs, 'assigneeId');
    if (task.projectRef?.sourceId) {
      await validateAssignees(nextAssigneeRefs, task.projectRef.sourceId);
    }

    const previousAssigneeIds = new Set((task.assignees || []).map((assignee) => String(assignee.userId)));
    const nextAssigneeIds = nextAssigneeRefs.map((assignee) => assignee._id);
    const nextAssigneeIdSet = new Set(nextAssigneeIds.map(String));
    const addedAssigneeIds = nextAssigneeIds.filter((userId) => !previousAssigneeIds.has(String(userId)));
    const removedAssigneeIds = [...previousAssigneeIds].filter((userId) => !nextAssigneeIdSet.has(String(userId)));
    const sourceNode = await WorkspaceNode.findOne({ _id: task.workspaceNodeId, deletedAt: null }).lean();
    if (!sourceNode) throw serviceError('Workspace not found', 404);

    task.assignees = nextAssigneeIds.map((userId) => {
      const existing = (task.assignees || []).find((assignee) => sameId(assignee.userId, userId));
      return existing || { userId, assignedAt: new Date(), assignedBy: actorUserId };
    });
    task.visibility = task.projectRef?.sourceId ? 'project' : (nextAssigneeIds.some((id) => !sameId(id, task.createdBy)) ? 'shared' : 'private');

    for (const userId of addedAssigneeIds) {
      await ensureUserPlacement(task, userId, sourceNode);
      task.logs.push(buildLogEntry('assigned', actorUserId, { assigneeId: userId, assignedBy: actorUserId, actorName }));
      notificationJobs.push({
        type: 'task_assigned',
        socketEvent: 'task_assigned',
        message: `You have been assigned to "${task.title}"`,
        onlyUsers: [String(userId)],
      });
    }

    for (const userId of removedAssigneeIds) {
      await TaskPlacement.deleteOne({ taskId: task._id, userId });
      task.logs.push(buildLogEntry('unassigned', actorUserId, { removedUserId: userId, removedBy: actorUserId, actorName }));
      notificationJobs.push({
        type: 'task_unassigned',
        socketEvent: 'task_unassigned',
        message: `You have been unassigned from "${task.title}"`,
        onlyUsers: [String(userId)],
      });
    }
  }

  if (data.checklist !== undefined) {
    task.checklist = Array.isArray(data.checklist)
      ? (await Promise.all(data.checklist.map((item, index) => normalizeChecklistItem(item, index, actorUserId)))).filter((item) => item.text)
      : [];
    task.logs.push(buildLogEntry('updated', actorUserId, { field: 'checklist' }));
    notificationJobs.push({ type: 'checklist_updated', socketEvent: 'checklist_updated', message: `"${task.title}" checklist was updated`, payload: { field: 'checklist', addedItems: listChangedItems(previousChecklist, task.checklist || []) } });
  }

  if (data.comments !== undefined) {
    task.comments = Array.isArray(data.comments)
      ? (await Promise.all(data.comments.map((item, index) => normalizeCommentItem(item, index, actorUserId, userDirectory)))).filter((item) => item.text)
      : [];
    const addedComments = listChangedItems(previousComments, task.comments || []);
    if (addedComments.length) {
      task.logs.push(buildLogEntry('commented', actorUserId, { commentIds: addedComments.map((c) => c.id) }));
      notificationJobs.push({ type: 'task_commented', socketEvent: 'comment_added', message: `New comment on "${task.title}"`, payload: { field: 'comments', comments: addedComments } });

      const mentionedUserIds = [...new Set(addedComments.flatMap((c) => (c.mentions || []).map(String)).filter(Boolean))];
      if (mentionedUserIds.length) {
        notificationJobs.push({ type: 'task_mention', socketEvent: 'comment_added', message: `You were mentioned on "${task.title}"`, onlyUsers: mentionedUserIds, payload: { field: 'comments', comments: addedComments } });
      }
    }
  }

  await task.save();
  const updatedTask = await enrichTaskPayload(task);
  for (const job of notificationJobs) await notifyTaskParticipants(updatedTask, actorUserId, job);
  return updatedTask;
}

async function assignMember(actorUserId, taskId, targetUserId) {
  let task = null;
  try {
    task = await Task.findOne({ _id: taskId });
    if (!task) throw serviceError('Task not found', 404);
    const targetAccount = await resolveTaskAccount(targetUserId);
    await assertAssignableAccounts([targetAccount], 'assigneeId');
    const targetCoreUserId = targetAccount._id;

    const alreadyAssigned = task.assignees.some((a) => String(a.userId) === String(targetCoreUserId));
    if (alreadyAssigned) throw serviceError('User is already assigned to this task', 409);

    if (task.projectRef?.sourceId) {
      await validateAssignees([targetAccount], task.projectRef.sourceId);
    }

    const userDirectory = await getUserDirectory([actorUserId, targetCoreUserId].map(String));
    const actorName = userDirectory[String(actorUserId)]?.name || '';
    const assigneeName = userDirectory[String(targetCoreUserId)]?.name || '';
    task.assignees.push({ userId: targetCoreUserId, assignedAt: new Date(), assignedBy: actorUserId });
    task.visibility = task.projectRef?.sourceId ? 'project' : 'shared';
    task.logs.push(buildLogEntry('assigned', actorUserId, { assigneeId: targetCoreUserId, assignedBy: actorUserId, actorName, assigneeName }));
    await task.save();

    const sourceNode = await WorkspaceNode.findOne({ _id: task.workspaceNodeId, deletedAt: null }).lean();
    if (!sourceNode) throw serviceError('Workspace not found', 404);

    const targetNode = await resolveUserNodeForTask(targetCoreUserId, sourceNode);
    await ensureUserPlacement(task, targetCoreUserId, sourceNode, targetNode);

    if (String(targetCoreUserId) !== String(actorUserId)) {
      await createNotification({
        userId: targetCoreUserId,
        type: 'task_assigned',
        taskId: task._id,
        taskTitle: task.title,
        projectId: task.projectId || null,
        workspaceNodeId: targetNode._id,
        workspaceNodeName: targetNode.name,
        triggeredBy: actorUserId,
        triggeredByName: actorName,
        message: `You have been assigned to "${task.title}"`,
      });
    }

    return enrichTaskPayload(task);
  } catch (err) {
    logAssignmentFailure({ actorUserId, taskId, targetUserId, projectId: task?.projectRef?.sourceId || null }, err);
    throw err;
  }
}

async function unassignMember(actorUserId, taskId, targetUserId) {
  const task = await Task.findOne({ _id: taskId });
  if (!task) throw serviceError('Task not found', 404);
  const targetAccount = await resolveTaskAccount(targetUserId);
  const targetCoreUserId = targetAccount._id;

  const userDirectory = await getUserDirectory([actorUserId, targetCoreUserId].map(String));
  const actorName = userDirectory[String(actorUserId)]?.name || '';
  const assigneeName = userDirectory[String(targetCoreUserId)]?.name || '';
  const idx = task.assignees.findIndex((a) => String(a.userId) === String(targetCoreUserId));
  if (idx === -1) throw serviceError('User is not assigned to this task', 404);

  task.assignees.splice(idx, 1);
  task.logs.push(buildLogEntry('unassigned', actorUserId, { removedUserId: targetCoreUserId, removedBy: actorUserId, actorName, assigneeName }));
  await task.save();

  const removedPlacement = await TaskPlacement.findOne({ taskId: task._id, userId: targetCoreUserId }).lean();
  await TaskPlacement.deleteOne({ taskId: task._id, userId: targetCoreUserId });

  if (String(targetCoreUserId) !== String(actorUserId)) {
    await createNotification({
      userId: targetCoreUserId,
      type: 'task_unassigned',
      taskId: task._id,
      taskTitle: task.title,
      projectId: task.projectId || null,
      workspaceNodeId: removedPlacement?.workspaceNodeId || task.workspaceNodeId,
      triggeredBy: actorUserId,
      triggeredByName: actorName,
      message: `You have been unassigned from "${task.title}"`,
    });
  }

  return enrichTaskPayload(task);
}

async function moveTaskToList(userId, taskId, newListId, auth = {}) {
  const list = await List.findOne({ _id: newListId, isArchived: false });
  if (!list) throw serviceError('List not found', 404);
  const placementUserId = list.userId;

  const taskQuery = {
    _id: taskId,
    status: { $ne: 'archived' },
  };
  if (!canManageProjectTasks(auth)) taskQuery.$or = [{ 'assignees.userId': placementUserId }, { createdBy: placementUserId }];

  const task = await Task.findOne(taskQuery);
  if (!task) throw serviceError('Task not found', 404);

  let placement = await TaskPlacement.findOne({ taskId, userId: placementUserId });
  if (!placement) {
    placement = await TaskPlacement.create({
      taskId,
      userId: placementUserId,
      workspaceNodeId: list.workspaceNodeId,
      listId: list._id,
      order: await nextPlacementOrder(placementUserId, list._id),
    });
  }

  const fromListId = placement.listId;
  if (sameId(fromListId, list._id) && sameId(placement.workspaceNodeId, list.workspaceNodeId)) {
    return placement.toObject();
  }

  placement.workspaceNodeId = list.workspaceNodeId;
  placement.listId = list._id;
  placement.placedAt = new Date();
  await placement.save();

  const createdAtMs = new Date(task.createdAt || 0).getTime();
  const isInitialCreatePlacement = task.logs?.length === 1 &&
    task.logs[0]?.action === 'created' &&
    Number.isFinite(createdAtMs) &&
    Date.now() - createdAtMs < 30000;

  if (!isInitialCreatePlacement) {
    await Task.updateOne(
      { _id: taskId },
      { $push: { logs: buildLogEntry('moved', placementUserId, { userId: placementUserId, fromListId, toListId: list._id }) } }
    );

    await notifyTaskParticipants(task.toObject(), placementUserId, {
      type: 'task_updated',
      socketEvent: 'task_moved',
      message: `"${task.title}" was moved`,
      payload: { field: 'placement', fromListId, toListId: list._id },
    });
  }

  return placement.toObject();
}

async function reorderTaskInList(userId, taskId, newOrder, listId = null) {
  let placement = null;

  if (listId) {
    const list = await List.findOne({ _id: listId, isArchived: false }).lean();
    if (!list) throw serviceError('List not found', 404);
    placement = await TaskPlacement.findOne({ taskId, listId: list._id, userId: list.userId });
  }

  placement = placement
    || await TaskPlacement.findOne({ taskId, userId })
    || await TaskPlacement.findOne({ taskId }).sort({ placedAt: -1 });
  if (!placement) throw serviceError('Placement not found', 404);
  placement.order = newOrder;
  await placement.save();
  return placement.toObject();
}

async function completeTask(actorUserId, taskId) {
  const task = await Task.findOne({ _id: taskId });
  if (!task) throw serviceError('Task not found', 404);
  task.status = 'completed';
  task.completedAt = new Date();
  task.completedBy = actorUserId;
  task.logs.push(buildLogEntry('completed', actorUserId));
  await task.save();
  const updatedTask = await enrichTaskPayload(task);
  await notifyTaskParticipants(updatedTask, actorUserId, { type: 'task_completed', socketEvent: 'task_completed', message: `"${task.title}" was completed`, payload: { field: 'status' } });
  return updatedTask;
}

async function archiveTask(actorUserId, taskId) {
  const task = await Task.findOne({ _id: taskId });
  if (!task) throw serviceError('Task not found', 404);
  task.status = 'archived';
  task.archivedAt = new Date();
  task.archivedBy = actorUserId;
  task.logs.push(buildLogEntry('archived', actorUserId));
  await task.save();
  const updatedTask = task.toObject();
  await notifyTaskParticipants(updatedTask, actorUserId, { type: 'task_archived', socketEvent: 'task_archived', message: `"${task.title}" was archived`, payload: { field: 'status' } });
  return updatedTask;
}

async function restoreTask(actorUserId, taskId) {
  const task = await Task.findOne({ _id: taskId });
  if (!task) throw serviceError('Task not found', 404);
  task.status = 'active';
  task.archivedAt = null;
  task.archivedBy = null;
  task.logs.push(buildLogEntry('restored', actorUserId));
  await task.save();
  const updatedTask = task.toObject();
  await notifyTaskParticipants(updatedTask, actorUserId, { type: 'task_restored', socketEvent: 'task_updated', message: `"${task.title}" was restored`, payload: { field: 'status' } });
  return updatedTask;
}

module.exports = {
  canManageProjectTasks,
  getProjectMembers: getProjectMembersRaw,
  validateAssignees,
  createTask,
  getTask,
  getAssignableUsersForNode,
  getTasksForNode,
  getWorkspaceTaskSummary,
  getUserTasksInNode,
  getAdminViewOfUserBoard,
  updateTask,
  assignMember,
  unassignMember,
  moveTaskToList,
  reorderTaskInList,
  completeTask,
  archiveTask,
  restoreTask,
};
