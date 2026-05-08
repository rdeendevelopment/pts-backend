const WorkspaceNode = require('../MongoModels/workspace_node.model');
const { CoreProject, CoreUser, ProjectAssignment } = require('../MongoModels');
const { ensureInboxExists, ensureDefaultTemplateLists } = require('../Services/task-system/list.service');

function isProjectWritable(project) {
  return Boolean(project) && !project.isDeleted && Boolean(project.isActive) && project.status === 'active';
}

function projectLockReason(project) {
  if (!project) return 'This project no longer exists. Existing tasks remain view-only.';
  if (project.isDeleted) return 'This project was deleted. Existing tasks remain view-only.';
  if (!Boolean(project.isActive)) return 'This project is inactive. New tasks are disabled.';
  if (project.status !== 'active') return `This project is ${project.status || 'not active'}. New tasks are disabled until it becomes active.`;
  return '';
}

async function resolveUserContext(userId, auth = {}) {
  if (!userId) {
    const err = new Error('User is required');
    err.status = 401;
    throw err;
  }

  const rawUserId = typeof userId === 'object' && userId !== null && typeof userId.toString === 'function'
    ? userId.toString()
    : String(userId);
  const isMongoId = /^[a-f\d]{24}$/i.test(rawUserId);
  const query = isMongoId ? { _id: rawUserId } : { legacyId: Number(userId) };

  const user = await CoreUser.findOne({ ...query, isDeleted: false }).lean();
  if (user) return user;

  // Admin accounts are AccountAdmin documents, not CoreUser.
  // Use the auth context to build a virtual user context for workspace operations.
  if (auth?.accountType === 'admin' && auth?.user) {
    const a = auth.user;
    return {
      _id: a._id,
      legacyId: a.id || 0,
      firstName: a.name || 'Admin',
      lastName: '',
      email: a.email || '',
      isAdminAccount: true,
    };
  }

  const err = new Error('User not found');
  err.status = 404;
  throw err;
}

async function syncUserProjects(userId, auth = {}) {
  const user = await resolveUserContext(userId, auth);
  let projects = [];
  const permissions = auth.permissions || [];
  const roles = (auth.roles || []).map((role) => String(role).toUpperCase());
  const canManage = permissions.includes('tasks.assign') ||
    permissions.includes('tasks.update_all') ||
    roles.includes('SUPER_ADMIN') ||
    roles.includes('ADMIN') ||
    roles.includes('MANAGER') ||
    auth.accountType === 'admin';

  if (canManage) {
    projects = await CoreProject.find({ isDeleted: false, isActive: true, status: 'active' }).lean();
  } else {
    const assignments = await ProjectAssignment.find({
      $or: [
        { userId: user._id },
        { legacyUserId: Number(user.legacyId) },
      ],
      status: 'assigned',
      isDeleted: false,
    }).lean();
    if (!assignments.length) return 0;
    const projectObjectIds = assignments.map((a) => a.projectId).filter(Boolean);
    const legacyProjectIds = assignments.map((a) => a.legacyProjectId).filter(Boolean);
    projects = await CoreProject.find({
      $or: [
        { _id: { $in: projectObjectIds } },
        { legacyId: { $in: legacyProjectIds } },
      ],
      isDeleted: false,
      isActive: true,
      status: 'active',
    }).lean();
  }

  for (const project of projects) {
    const node = await WorkspaceNode.findOneAndUpdate(
      { userId: user._id, projectId: project._id },
      {
        $set: {
          userId: user._id,
          legacyUserId: user.legacyId,
          name: project.title,
          type: 'project',
          depth: 0,
          parentId: null,
          rootProjectId: null,
          projectId: project._id,
          isUserCreated: false,
          'projectRef.sourceId': project.legacyId,
          'projectRef.sourceType': 'mongodb',
          deletedAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await ensureDefaultTemplateLists(user._id, node._id);
  }

  return projects.length;
}

async function annotateProjectNodes(nodes) {
  const projectIdByNodeId = new Map(
    nodes
      .filter((node) => node.projectRef?.sourceId)
      .map((node) => [String(node._id), Number(node.projectRef.sourceId)])
  );
  const projectIds = Array.from(new Set(
    nodes
      .map((node) => Number(node.projectRef?.sourceId || projectIdByNodeId.get(String(node.rootProjectId)) || 0))
      .filter(Boolean)
  ));

  if (!projectIds.length) return nodes;

  const projects = await CoreProject.find({ legacyId: { $in: projectIds } }).lean();
  const projectMap = new Map(projects.map((project) => [Number(project.legacyId), project]));

  return nodes.map((node) => {
    const projectId = Number(node.projectRef?.sourceId || projectIdByNodeId.get(String(node.rootProjectId)) || 0);
    if (!projectId) return node;

    const project = projectMap.get(projectId);
    const locked = !isProjectWritable(project);
    return {
      ...node,
      projectStatus: project?.status || 'deleted',
      projectIsActive: Boolean(project?.isActive),
      projectIsDeleted: Boolean(project?.isDeleted || !project),
      locked,
      lockReason: locked ? projectLockReason(project) : '',
    };
  });
}

async function getUserTree(userId, auth = {}, options = {}) {
  const user = await resolveUserContext(userId, auth);
  const existingCount = await WorkspaceNode.countDocuments({ userId: user._id, deletedAt: null });
  const shouldSync = options.forceSync === true || existingCount === 0;
  if (shouldSync) await syncUserProjects(user._id, auth);
  const nodes = await WorkspaceNode.find({ userId: user._id, deletedAt: null }).sort({ order: 1 }).lean();
  return annotateProjectNodes(nodes);
}

async function createFolder(userId, data, auth = {}) {
  const user = await resolveUserContext(userId, auth);
  const { name, parentId, icon, color } = data;
  if (!name || !name.trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }

  let depth = 0;
  let rootProjectId = null;

  if (parentId) {
    const parent = await WorkspaceNode.findOne({ _id: parentId, userId: user._id, deletedAt: null });
    if (!parent) {
      const err = new Error('Parent node not found');
      err.status = 404;
      throw err;
    }
    depth = parent.depth + 1;
    rootProjectId = parent.rootProjectId || parent._id;
  }

  const type = depth === 0 ? 'folder' : 'subfolder';
  const siblingCount = await WorkspaceNode.countDocuments({ userId: user._id, parentId: parentId || null, deletedAt: null });

  const node = await WorkspaceNode.create({
    userId: user._id,
    legacyUserId: user.legacyId,
    name: name.trim(),
    type,
    parentId: parentId || null,
    rootProjectId,
    depth,
    isUserCreated: true,
    icon: icon || null,
    color: color || null,
    order: siblingCount + 1,
  });

  if (data?.templateKey === 'default' || data?.useDefaultTemplate === true) {
    await ensureDefaultTemplateLists(user._id, node._id);
  } else {
    await ensureInboxExists(user._id, node._id);
  }

  return node.toObject();
}

async function renameNode(userId, nodeId, newName, auth = {}) {
  const user = await resolveUserContext(userId, auth);
  if (!newName || !newName.trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const node = await WorkspaceNode.findOneAndUpdate({ _id: nodeId, userId: user._id, deletedAt: null }, { $set: { name: newName.trim() } }, { new: true });
  if (!node) {
    const err = new Error('Node not found');
    err.status = 404;
    throw err;
  }
  return node.toObject();
}

async function deleteFolder(userId, nodeId, auth = {}) {
  const user = await resolveUserContext(userId, auth);
  const node = await WorkspaceNode.findOne({ _id: nodeId, userId: user._id, deletedAt: null });
  if (!node) {
    const err = new Error('Node not found');
    err.status = 404;
    throw err;
  }
  if (node.type === 'project') {
    const err = new Error('Cannot delete a project node');
    err.status = 400;
    throw err;
  }
  const now = new Date();
  await WorkspaceNode.updateOne({ _id: nodeId }, { $set: { deletedAt: now } });
  await WorkspaceNode.updateMany(
    { userId: user._id, $or: [{ parentId: node._id }, { rootProjectId: node._id }], deletedAt: null },
    { $set: { deletedAt: now } }
  );
  return { deleted: true };
}

async function reorderNodes(userId, updates, auth = {}) {
  const user = await resolveUserContext(userId, auth);
  if (!Array.isArray(updates) || !updates.length) {
    const err = new Error('updates must be a non-empty array');
    err.status = 400;
    throw err;
  }
  for (const { nodeId, order } of updates) {
    await WorkspaceNode.updateOne({ _id: nodeId, userId: user._id }, { $set: { order } });
  }
  return { updated: true };
}

module.exports = {
  syncUserProjects,
  annotateProjectNodes,
  getUserTree,
  createFolder,
  renameNode,
  deleteFolder,
  reorderNodes,
};
