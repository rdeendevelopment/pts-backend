const { AppError } = require('../../../kernel/errors');
const projectsModule = require('../../projects');
const userRepository = require('../../users/repositories/user.repository');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskErrorCodes = require('../errors/taskErrorCodes');
const { canManageTasks, resolveUserIdFromAuth } = require('../helpers/taskAccessScope.helper');
const taskMemberRepository = require('../repositories/taskMember.repository');
const { displayName, resolveUsersByIds } = require('../helpers/taskUser.helper');
const { mapAssignmentRoleToTaskRole } = require('../helpers/taskMemberRole.helper');

async function assertProjectExists(projectId) {
  return projectsModule.getProjectForActivity(projectId);
}

async function assertCanAccessProjectForTasks(req, projectId) {
  const project = await assertProjectExists(projectId);
  if (!req?.v2Auth?.accountId || canManageTasks(req)) {
    return project;
  }

  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  await assertUserHasProjectAccess(projectId, userId);
  return project;
}

/**
 * Task assignees must use pts_users ids. Accept account ids when callers send the wrong shape.
 */
async function resolveProjectMemberUserId(rawUserId) {
  const id = String(rawUserId || '').trim();
  if (!id) return null;

  const byUserId = await userRepository.findById(id);
  if (byUserId) return String(byUserId._id);

  const byAccountId = await userRepository.findByAccountId(id);
  if (byAccountId) return String(byAccountId._id);

  return id;
}

async function normalizeAssigneeUserIds(userIds = []) {
  const normalized = [];
  for (const rawUserId of userIds) {
    const userId = await resolveProjectMemberUserId(rawUserId);
    if (userId) normalized.push(userId);
  }
  return [...new Set(normalized)];
}

async function assertUserHasProjectAccess(projectId, userId, { rawUserId = null } = {}) {
  const resolvedUserId = await resolveProjectMemberUserId(userId);
  const assignment = await projectsModule.getAssignmentForUser(projectId, resolvedUserId);
  if (!assignment) {
    throw new AppError('User is not assigned to this project', {
      status: 403,
      code: taskErrorCodes.TASK_ASSIGNEE_NOT_ON_PROJECT,
      details: {
        projectId: String(projectId),
        userId: String(resolvedUserId),
        ...(rawUserId && String(rawUserId) !== String(resolvedUserId)
          ? { requestedUserId: String(rawUserId) }
          : {}),
      },
    });
  }
  return assignment;
}

async function assertAssigneesOnProject(projectId, userIds = []) {
  const normalized = await normalizeAssigneeUserIds(userIds);
  for (const userId of normalized) {
    await assertUserHasProjectAccess(projectId, userId);
  }
  return normalized;
}

async function getEffectiveTaskRole(projectId, userId) {
  const member = await taskMemberRepository.findByProjectAndUser(projectId, userId);
  if (member?.role) return member.role;

  const assignment = await projectsModule.getAssignmentForUser(projectId, userId);
  if (!assignment) return null;

  // Project assignment grants task access; task-specific role defaults to member.
  return 'member';
}

async function listTaskMembers(projectId) {
  await assertProjectExists(projectId);

  const [assignments, taskMembers] = await Promise.all([
    projectAssignmentRepository.listByProjectId(projectId, { status: 'active' }),
    taskMemberRepository.listByProjectId(projectId),
  ]);

  const taskMemberMap = new Map(taskMembers.map((row) => [String(row.userId), row]));
  const userMap = await resolveUsersByIds(assignments.map((row) => String(row.userId)));

  return assignments.map((assignment) => {
    const taskMember = taskMemberMap.get(String(assignment.userId));
    const user = userMap[String(assignment.userId)];
    const taskRole = taskMember?.role || mapAssignmentRoleToTaskRole(assignment.role) || 'member';
    return {
      userId: String(assignment.userId),
      projectAssignmentId: String(assignment._id),
      projectAssignmentRole: assignment.role,
      taskMemberRole: taskMember?.role || null,
      taskMemberId: taskMember ? String(taskMember._id) : String(assignment._id),
      name: displayName(user),
      email: user?.email || '',
      taskRole,
    };
  });
}

module.exports = {
  assertProjectExists,
  assertCanAccessProjectForTasks,
  resolveProjectMemberUserId,
  normalizeAssigneeUserIds,
  assertUserHasProjectAccess,
  assertAssigneesOnProject,
  getEffectiveTaskRole,
  listTaskMembers,
};
