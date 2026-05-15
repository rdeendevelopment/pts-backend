// admin.service.js — Phase 6 project settings, workflow management, members, collaborators.
// V2 collections only. Legacy collections are read-only here (access check).

const { CoreProject, CoreUser, AccountAdmin, ProjectAssignment } = require('../../../MongoModels');
const {
  TaskV2,
  TaskProjectMemberV2,
  TaskCollaboratorV2,
} = require('../models');
const {
  getWorkflowForProject,
  addStatus,
  updateStatus,
  reorderStatuses,
  archiveStatus,
} = require('./workflow.service');
const taskAccess = require('./task-access.service');

function err(msg, status = 400) {
  const e = new Error(msg); e.status = status; return e;
}

function displayUserName(user) {
  if (!user) return '';
  if (user.name && String(user.name).trim()) return String(user.name).trim();
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (fullName) return fullName;
  if (user.userName && String(user.userName).trim()) return String(user.userName).trim();
  return user.email || '';
}

async function resolveUsersForMembers(userIds = []) {
  const ids = [...new Set((userIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return {};
  const [coreUsers, adminUsers] = await Promise.all([
    CoreUser.find({ _id: { $in: ids }, isDeleted: false }).select('firstName lastName userName email').lean(),
    AccountAdmin.find({ _id: { $in: ids }, isDeleted: false }).select('name email type').lean(),
  ]);
  const map = {};
  for (const u of coreUsers) map[String(u._id)] = { ...u, __kind: 'core' };
  for (const u of adminUsers) map[String(u._id)] = { ...u, __kind: 'admin' };
  return map;
}

async function nextProjectAssignmentLegacyId() {
  const last = await ProjectAssignment.findOne().sort({ legacyId: -1 }).select('legacyId').lean();
  return last?.legacyId != null ? Number(last.legacyId) + 1 : 1;
}

async function canManageProjectTasks(projectSourceId, actorId, isPlatformAdmin) {
  if (isPlatformAdmin) return true;
  if (!actorId) return false;

  const tm = await TaskProjectMemberV2.findOne({
    projectRef: { sourceId: Number(projectSourceId) },
    userId: actorId,
    isActive: true,
    role: { $in: ['owner', 'admin'] },
  }).lean();
  return !!tm;
}

async function assertCanManageProject(projectSourceId, actorId, isPlatformAdmin) {
  if (!(await canManageProjectTasks(projectSourceId, actorId, isPlatformAdmin))) {
    throw err('You do not have permission to manage this project', 403);
  }
}

async function assertProjectReadable(projectSourceId, actorId, isPlatformAdmin) {
  await taskAccess.assertProjectReadable(projectSourceId, actorId, isPlatformAdmin);
}

async function userHasActiveAssignment(projectSourceId, userId) {
  if (!userId) return false;
  const member = await ProjectAssignment.findOne({
    legacyProjectId: Number(projectSourceId),
    userId,
    isDeleted: false,
    status: 'assigned',
  }).lean();
  return !!member;
}

async function assertCanManageTaskCollaborators(task, actorId, isPlatformAdmin) {
  if (isPlatformAdmin) return;
  const pid = Number(task.projectRef?.sourceId);
  const role = Number.isFinite(pid)
    ? await taskAccess.getEffectiveProjectRole(pid, actorId, false)
    : null;
  if (role === 'owner' || role === 'admin' || role === 'member') return;
  if (String(task.createdBy) === String(actorId)) return;
  throw err('You do not have permission to manage collaborators', 403);
}

async function findTaskUserByEmailOrId(data) {
  const email = data.email ? String(data.email).toLowerCase().trim() : '';
  const userId = data.userId ? String(data.userId).trim() : '';

  if (email) {
    const [coreUser, adminUser] = await Promise.all([
      CoreUser.findOne({ email, isDeleted: false }).lean(),
      AccountAdmin.findOne({ email, isDeleted: false }).lean(),
    ]);
    if (coreUser) return { ...coreUser, __kind: 'core' };
    if (adminUser) return { ...adminUser, __kind: 'admin' };
    return null;
  }

  if (userId) {
    const [coreUser, adminUser] = await Promise.all([
      CoreUser.findOne({ _id: userId, isDeleted: false }).lean(),
      AccountAdmin.findOne({ _id: userId, isDeleted: false }).lean(),
    ]);
    if (coreUser) return { ...coreUser, __kind: 'core' };
    if (adminUser) return { ...adminUser, __kind: 'admin' };
    return null;
  }

  return null;
}

function collaboratorToDto(collab, user) {
  return {
    ...collab,
    name: displayUserName(user),
    email: user?.email || '',
  };
}

// ── Project Settings ──────────────────────────────────────────────────────────

async function getProjectSettings(projectSourceId, actorId, isPlatformAdmin) {
  const sourceId = Number(projectSourceId);
  await assertProjectReadable(sourceId, actorId, isPlatformAdmin);

  const project = await CoreProject.findOne({ legacyId: sourceId }).lean();
  if (!project) throw err('Project not found', 404);

  const [taskCount, memberCount, overdueCount] = await Promise.all([
    TaskV2.countDocuments({ 'projectRef.sourceId': sourceId, status: 'active' }),
    ProjectAssignment.countDocuments({ legacyProjectId: sourceId, isDeleted: false }),
    TaskV2.countDocuments({
      'projectRef.sourceId': sourceId,
      status: 'active',
      dueDate: { $lt: new Date() },
    }),
  ]);

  const { statuses } = await getWorkflowForProject(sourceId).catch(() => ({ statuses: [] }));

  const canManage = await canManageProjectTasks(sourceId, actorId, isPlatformAdmin);

  return {
    id: sourceId,
    name: project.title || '',
    description: project.detail || '',
    status: project.status,
    isActive: project.isActive,
    createdAt: project.createdAt,
    stats: { taskCount, memberCount, overdueCount },
    statuses,
    canManage,
  };
}

async function updateProjectSettings(projectSourceId, actorId, isPlatformAdmin, data) {
  await assertCanManageProject(projectSourceId, actorId, isPlatformAdmin);

  const patch = {};
  if (data.name !== undefined && String(data.name).trim()) patch.title = String(data.name).trim();
  if (data.description !== undefined) patch.detail = String(data.description);

  await CoreProject.updateOne({ legacyId: Number(projectSourceId) }, { $set: patch });
  return getProjectSettings(projectSourceId, actorId, isPlatformAdmin);
}

// ── Workflow Status Management ────────────────────────────────────────────────

async function addWorkflowStatus(projectSourceId, actorId, isPlatformAdmin, data) {
  await assertCanManageProject(projectSourceId, actorId, isPlatformAdmin);
  return addStatus(projectSourceId, actorId, data);
}

async function updateWorkflowStatus(projectSourceId, statusId, actorId, isPlatformAdmin, data) {
  await assertCanManageProject(projectSourceId, actorId, isPlatformAdmin);
  return updateStatus(statusId, data);
}

async function reorderWorkflowStatuses(projectSourceId, actorId, isPlatformAdmin, updates) {
  await assertCanManageProject(projectSourceId, actorId, isPlatformAdmin);
  return reorderStatuses(projectSourceId, updates);
}

async function archiveWorkflowStatus(projectSourceId, statusId, actorId, isPlatformAdmin, replacementStatusId) {
  await assertCanManageProject(projectSourceId, actorId, isPlatformAdmin);
  if (!replacementStatusId) throw err('replacementStatusId is required', 400);
  return archiveStatus(statusId, replacementStatusId);
}

// ── Members ───────────────────────────────────────────────────────────────────

async function getProjectMembers(projectSourceId, actorId, isPlatformAdmin) {
  const sourceId = Number(projectSourceId);
  await assertProjectReadable(sourceId, actorId, isPlatformAdmin);

  const assignments = await ProjectAssignment.find({
    legacyProjectId: sourceId,
    isDeleted: false,
  }).lean();

  const userIds = assignments.map((a) => String(a.userId));
  const userMap = await resolveUsersForMembers(userIds);

  const taskMembers = await TaskProjectMemberV2.find({
    'projectRef.sourceId': sourceId,
    isActive: true,
  }).lean();
  const roleMap = {};
  for (const m of taskMembers) roleMap[String(m.userId)] = m;

  return assignments.map((a) => {
    const uid = String(a.userId);
    const user = userMap[uid] || {};
    const taskMember = roleMap[uid];
    const accountType = user.__kind === 'admin' ? (user.type || 'admin') : 'user';
    return {
      _id: uid,
      userId: uid,
      name: displayUserName(user),
      email: user.email || '',
      accountType,
      taskRole: taskMember?.role || (user.__kind === 'admin' && user.type === 'super-admin' ? 'admin' : 'member'),
      taskMemberId: taskMember?._id ? String(taskMember._id) : null,
      addedAt: a.assignedAt || a.createdAt,
    };
  });
}

function memberRecordDto(userDoc, taskMemberDoc, assignmentRow) {
  const uid = String(userDoc._id);
  const tm = taskMemberDoc?.toObject ? taskMemberDoc.toObject() : taskMemberDoc;
  return {
    _id: uid,
    userId: uid,
    name: displayUserName(userDoc),
    email: userDoc.email || '',
    accountType: userDoc.__kind === 'admin' ? (userDoc.type || 'admin') : 'user',
    taskRole: tm?.role || 'member',
    taskMemberId: tm?._id ? String(tm._id) : null,
    addedAt: assignmentRow?.assignedAt || assignmentRow?.createdAt || undefined,
  };
}

async function addProjectMember(projectSourceId, actorId, isPlatformAdmin, data) {
  await assertCanManageProject(projectSourceId, actorId, isPlatformAdmin);

  const sourceId = Number(projectSourceId);
  const user = await findTaskUserByEmailOrId(data);
  if (!user) throw err('User not found', 404);

  const project = await CoreProject.findOne({ legacyId: sourceId }).lean();
  if (!project?._id) throw err('Project not found', 404);

  const role = ['owner', 'admin', 'member', 'viewer'].includes(data.role) ? data.role : 'member';

  let assignment = await ProjectAssignment.findOne({
    legacyProjectId: sourceId,
    userId: user._id,
  }).lean();

  if (user.__kind === 'core') {
    if (!assignment) {
      const legacyUserId = user.legacyId != null ? Number(user.legacyId) : NaN;
      if (!Number.isFinite(legacyUserId)) {
        throw err('User record is missing legacyId — cannot assign to project', 400);
      }
      await ProjectAssignment.create({
        legacyId: await nextProjectAssignmentLegacyId(),
        legacyProjectId: sourceId,
        legacyUserId,
        projectId: project._id,
        userId: user._id,
        assignDate: new Date(),
        status: 'assigned',
        isDeleted: false,
        assignedAt: new Date(),
      });
    } else if (assignment.isDeleted) {
      await ProjectAssignment.updateOne(
        { _id: assignment._id },
        { $set: { isDeleted: false, status: 'assigned', unassignDate: null } },
      );
    }
    assignment = await ProjectAssignment.findOne({
      legacyProjectId: sourceId,
      userId: user._id,
    }).lean();
  }

  let tm = await TaskProjectMemberV2.findOne({
    'projectRef.sourceId': sourceId,
    userId: user._id,
  });

  if (tm) {
    tm.isActive = true;
    tm.role = role;
    tm.projectId = project._id;
    await tm.save();
  } else {
    tm = await TaskProjectMemberV2.create({
      projectId: project._id,
      projectRef: { sourceId, sourceType: 'mongodb' },
      userId: user._id,
      role,
      addedBy: actorId,
    });
  }

  return memberRecordDto(user, tm, assignment);
}

async function updateProjectMember(projectSourceId, memberId, actorId, isPlatformAdmin, data) {
  await assertCanManageProject(projectSourceId, actorId, isPlatformAdmin);

  const member = await TaskProjectMemberV2.findOne({
    _id: memberId,
    'projectRef.sourceId': Number(projectSourceId),
  });
  if (!member) throw err('Member not found', 404);

  if (data.role) member.role = data.role;
  await member.save();
  return member.toObject();
}

async function removeProjectMember(projectSourceId, memberId, actorId, isPlatformAdmin) {
  await assertCanManageProject(projectSourceId, actorId, isPlatformAdmin);
  await TaskProjectMemberV2.findByIdAndUpdate(memberId, { $set: { isActive: false } });
  return { success: true };
}

// ── Collaborators ─────────────────────────────────────────────────────────────

async function getCollaborators(taskId, actorId, isPlatformAdmin) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);
  await taskAccess.assertTaskReadable(task, actorId, isPlatformAdmin);

  const collabs = await TaskCollaboratorV2.find({ taskId, isActive: true }).lean();
  const userIds = collabs.map((c) => String(c.userId));
  const userMap = await resolveUsersForMembers(userIds);

  return collabs.map((c) => collaboratorToDto(c, userMap[String(c.userId)] || {}));
}

async function addCollaborator(taskId, actorId, isPlatformAdmin, data) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);

  await assertCanManageTaskCollaborators(task, actorId, isPlatformAdmin);

  const user = await findTaskUserByEmailOrId(data);
  if (!user) throw err('User not found', 404);

  const projectSourceId = Number(task.projectRef?.sourceId);
  if (await userHasActiveAssignment(projectSourceId, user._id)) {
    throw err('User is already a project member', 400);
  }

  const existing = await TaskCollaboratorV2.findOne({ taskId, userId: user._id });
  if (existing) {
    existing.isActive = true;
    existing.accessType = data.accessType || existing.accessType || 'comment';
    await existing.save();
    return collaboratorToDto(existing.toObject(), user);
  }

  const collab = await TaskCollaboratorV2.create({
    taskId,
    userId: user._id,
    accessType: data.accessType || 'comment',
    addedBy: actorId,
  });

  return collaboratorToDto(collab.toObject(), user);
}

async function removeCollaborator(taskId, userId, actorId, isPlatformAdmin) {
  const task = await TaskV2.findById(taskId).lean();
  if (!task) throw err('Task not found', 404);
  if (String(userId) !== String(actorId)) {
    await assertCanManageTaskCollaborators(task, actorId, isPlatformAdmin);
  }
  await TaskCollaboratorV2.updateOne({ taskId, userId }, { $set: { isActive: false } });
  return { success: true };
}

module.exports = {
  getProjectSettings,
  updateProjectSettings,
  addWorkflowStatus,
  updateWorkflowStatus,
  reorderWorkflowStatuses,
  archiveWorkflowStatus,
  getProjectMembers,
  addProjectMember,
  updateProjectMember,
  removeProjectMember,
  getCollaborators,
  addCollaborator,
  removeCollaborator,
};
