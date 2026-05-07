const List = require('../../MongoModels/list.model');
const WorkspaceNode = require('../../MongoModels/workspace_node.model');
const TaskPlacement = require('../../MongoModels/task_placement.model');
const { CoreProject, CoreUser, ProjectAssignment } = require('../../MongoModels');

const DEFAULT_TEMPLATE_LISTS = [
  { name: 'Inbox', isInbox: true, order: 0, color: '#64748B', icon: 'ri-inbox-line' },
  { name: 'To Do', isInbox: false, order: 1024, color: '#3B82F6', icon: 'ri-checkbox-blank-circle-line' },
  { name: 'In Progress', isInbox: false, order: 2048, color: '#F59E0B', icon: 'ri-loader-4-line' },
  { name: 'Review', isInbox: false, order: 3072, color: '#8B5CF6', icon: 'ri-eye-line' },
  { name: 'Done', isInbox: false, order: 4096, color: '#10B981', icon: 'ri-checkbox-circle-line' },
];

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

function isMongoId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

async function resolveCoreUserId(value) {
  const raw = String(value || '');
  const query = isMongoId(raw) ? { _id: raw } : { legacyId: Number(raw) };
  if (!query._id && !Number.isFinite(query.legacyId)) {
    const err = new Error('Invalid userId');
    err.status = 400;
    throw err;
  }

  const user = await CoreUser.findOne({ ...query, isDeleted: false }, { _id: 1, legacyId: 1 }).lean();
  if (!user) {
    const err = new Error(`User ${value} was not found`);
    err.status = 404;
    throw err;
  }
  return user;
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

async function resolveViewNodeForUser(actorUserId, workspaceNodeId, viewAsUserId, auth = {}) {
  const node = await WorkspaceNode.findOne({ _id: workspaceNodeId, userId: actorUserId, deletedAt: null }).lean();
  if (!node) {
    const err = new Error('Workspace not found');
    err.status = 404;
    throw err;
  }

  if (!viewAsUserId) return { node, userId: actorUserId };
  if (!canManageProjectTasks(auth)) {
    const err = new Error('Not authorized to view other users\' boards');
    err.status = 403;
    throw err;
  }

  const projectRef = await resolveProjectRefForNode(node);
  if (!projectRef.sourceId) {
    const err = new Error('Only project task boards can be viewed for another user');
    err.status = 400;
    throw err;
  }

  const targetUser = await resolveCoreUserId(viewAsUserId);
  const project = await CoreProject.findOne({ legacyId: Number(projectRef.sourceId) }, { _id: 1, legacyId: 1 }).lean();
  const membership = await ProjectAssignment.findOne({
    userId: targetUser._id,
    $or: [
      ...(project?._id ? [{ projectId: project._id }] : []),
      { legacyProjectId: Number(projectRef.sourceId) },
    ],
    status: 'assigned',
    isDeleted: false,
  }).lean();
  if (!membership) {
    const err = new Error('This user is not assigned to the project. Assign them first.');
    err.status = 404;
    throw err;
  }

  let targetNode = await WorkspaceNode.findOne({
    userId: targetUser._id,
    'projectRef.sourceId': Number(projectRef.sourceId),
    deletedAt: null,
  }).lean();

  if (!targetNode) {
    targetNode = await WorkspaceNode.create({
      userId: targetUser._id,
      legacyUserId: targetUser.legacyId,
      name: node.name,
      type: 'project',
      depth: 0,
      parentId: null,
      rootProjectId: null,
      projectId: project?._id || null,
      isUserCreated: false,
      'projectRef.sourceId': Number(projectRef.sourceId),
      'projectRef.sourceType': projectRef.sourceType || 'mongodb',
      deletedAt: null,
    });
  }

  return { node: targetNode.toObject ? targetNode.toObject() : targetNode, userId: targetUser._id };
}

async function getListsForNode(userId, workspaceNodeId, options = {}) {
  const { node, userId: effectiveUserId } = await resolveViewNodeForUser(
    userId,
    workspaceNodeId,
    options.viewAsUserId,
    options.auth
  );

  await ensureInboxExists(effectiveUserId, node._id);

  return List.find({ userId: effectiveUserId, workspaceNodeId: node._id, isArchived: false })
    .sort({ order: 1 })
    .lean();
}

async function createList(userId, workspaceNodeId, data) {
  const { name, color, icon } = data;

  if (!name || !name.trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }

  const node = await WorkspaceNode.findOne({ _id: workspaceNodeId, userId, deletedAt: null });
  if (!node) {
    const err = new Error('Workspace not found');
    err.status = 404;
    throw err;
  }

  const duplicate = await List.findOne({
    userId,
    workspaceNodeId,
    name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
  });
  if (duplicate) {
    const err = new Error('A list with this name already exists');
    err.status = 409;
    throw err;
  }

  const count = await List.countDocuments({ userId, workspaceNodeId });

  const list = await List.create({
    userId,
    workspaceNodeId,
    name: name.trim(),
    color: color || null,
    icon: icon || null,
    order: count + 1,
    isInbox: false,
  });

  return list.toObject();
}

async function ensureInboxExists(userId, workspaceNodeId) {
  const existing = await List.findOne({
    userId,
    workspaceNodeId,
    isArchived: false,
    $or: [
      { isInbox: true },
      { name: { $regex: /^Inbox$/i } },
    ],
  });

  if (existing) {
    let changed = false;

    if (!existing.isInbox) {
      existing.isInbox = true;
      changed = true;
    }

    if (existing.name !== 'Inbox') {
      existing.name = 'Inbox';
      changed = true;
    }

    if (existing.order !== 0) {
      existing.order = 0;
      changed = true;
    }

    if (changed) await existing.save();
    return existing.toObject();
  }

  const list = await List.create({
    userId,
    workspaceNodeId,
    name: 'Inbox',
    isInbox: true,
    order: 0,
  });

  return list.toObject();
}

async function ensureDefaultTemplateLists(userId, workspaceNodeId) {
  await ensureInboxExists(userId, workspaceNodeId);

  const activeLists = await List.find({ userId, workspaceNodeId, isArchived: false }).lean();
  const existingNames = new Set(activeLists.map((list) => String(list.name || '').trim().toLowerCase()));
  const created = [];

  for (const template of DEFAULT_TEMPLATE_LISTS.filter((item) => !item.isInbox)) {
    if (existingNames.has(template.name.toLowerCase())) continue;

    const list = await List.create({
      userId,
      workspaceNodeId,
      name: template.name,
      color: template.color,
      icon: template.icon,
      order: template.order,
      isInbox: false,
    });

    created.push(list.toObject());
    existingNames.add(template.name.toLowerCase());
  }

  return created;
}

async function renameList(userId, listId, newName) {
  if (!newName || !newName.trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }

  const list = await List.findOne({ _id: listId, userId });
  if (!list) {
    const err = new Error('List not found');
    err.status = 404;
    throw err;
  }

  const duplicate = await List.findOne({
    _id: { $ne: listId },
    userId,
    workspaceNodeId: list.workspaceNodeId,
    name: { $regex: new RegExp(`^${newName.trim()}$`, 'i') },
  });
  if (duplicate) {
    const err = new Error('A list with this name already exists');
    err.status = 409;
    throw err;
  }

  list.name = newName.trim();
  await list.save();

  return list.toObject();
}

async function deleteList(userId, listId) {
  const list = await List.findOne({ _id: listId, userId });
  if (!list) {
    const err = new Error('List not found');
    err.status = 404;
    throw err;
  }

  if (list.isInbox) {
    const err = new Error('Inbox list cannot be deleted');
    err.status = 400;
    throw err;
  }

  const placementCount = await TaskPlacement.countDocuments({ listId });
  if (placementCount > 0) {
    const err = new Error('Move all tasks out of this list before deleting');
    err.status = 400;
    throw err;
  }

  await List.deleteOne({ _id: listId });

  return { deleted: true };
}

async function reorderLists(userId, workspaceNodeId, updates) {
  if (!Array.isArray(updates) || !updates.length) {
    const err = new Error('updates must be a non-empty array');
    err.status = 400;
    throw err;
  }

  for (const { listId, order } of updates) {
    await List.updateOne({ _id: listId, userId }, { $set: { order } });
  }

  return { updated: true };
}

async function archiveList(userId, listId) {
  const list = await List.findOne({ _id: listId, userId });
  if (!list) {
    const err = new Error('List not found');
    err.status = 404;
    throw err;
  }

  if (list.isInbox) {
    const err = new Error('Inbox list cannot be archived');
    err.status = 400;
    throw err;
  }

  list.isArchived = true;
  await list.save();

  return list.toObject();
}

module.exports = {
  getListsForNode,
  createList,
  ensureInboxExists,
  ensureDefaultTemplateLists,
  renameList,
  deleteList,
  reorderLists,
  archiveList,
};
