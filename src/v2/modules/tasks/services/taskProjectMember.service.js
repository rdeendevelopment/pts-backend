const { AppError } = require('../../../kernel/errors');
const userRepository = require('../../users/repositories/user.repository');
const projectAssignmentService = require('../../projects/services/projectAssignment.service');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskMemberRepository = require('../repositories/taskMember.repository');
const taskAccessService = require('./taskAccess.service');
const taskErrorCodes = require('../errors/taskErrorCodes');
const {
  mapTaskRoleToAssignmentRole,
  mapAssignmentRoleToTaskRole,
  normalizeTaskMemberRole,
} = require('../helpers/taskMemberRole.helper');
const { displayName } = require('../helpers/taskUser.helper');

async function resolveUserFromPayload(payload) {
  if (payload.userId) {
    const user = await userRepository.findById(payload.userId);
    if (!user || user.isDeleted) {
      throw new AppError('User not found', {
        status: 404,
        code: taskErrorCodes.TASK_USER_NOT_FOUND,
      });
    }
    return user;
  }

  if (payload.email) {
    const user = await userRepository.findByEmail(payload.email);
    if (!user) {
      throw new AppError('User not found', {
        status: 404,
        code: taskErrorCodes.TASK_USER_NOT_FOUND,
      });
    }
    return user;
  }

  throw new AppError('email or userId is required', {
    status: 400,
    code: taskErrorCodes.TASK_USER_NOT_FOUND,
  });
}

async function resolveAssignmentId(projectId, memberId) {
  const assignment = await projectAssignmentRepository.findById(memberId, { projectId });
  if (assignment) return String(assignment._id);

  const taskMember = await taskMemberRepository.findById(memberId, { projectId });
  if (taskMember) {
    const linkedAssignment = await projectAssignmentRepository.findByProjectAndUser(
      projectId,
      taskMember.userId
    );
    if (linkedAssignment) return String(linkedAssignment._id);
  }

  throw new AppError('Member not found', {
    status: 404,
    code: taskErrorCodes.TASK_MEMBER_NOT_FOUND,
  });
}

async function buildMemberDto(projectId, assignment, taskMember = null) {
  const user = await userRepository.findById(assignment.userId);
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
    addedAt: assignment.assignedAt || assignment.createdAt,
  };
}

async function addProjectMember(projectId, payload, accountId, req = null) {
  await taskAccessService.assertProjectExists(projectId);

  const user = await resolveUserFromPayload(payload);
  const taskRole = normalizeTaskMemberRole(payload.role);
  const assignmentRole = mapTaskRoleToAssignmentRole(taskRole);

  const created = await projectAssignmentService.createAssignment(
    projectId,
    { userId: user._id, role: assignmentRole },
    accountId,
    req
  );

  const taskMember = await taskMemberRepository.upsertActive({
    projectId,
    userId: user._id,
    role: taskRole,
    addedBy: accountId,
  });

  const assignment = await projectAssignmentRepository.findById(created.id, { projectId });
  return buildMemberDto(projectId, assignment, taskMember);
}

async function updateProjectMember(projectId, memberId, payload, accountId, req = null) {
  await taskAccessService.assertProjectExists(projectId);

  const assignmentId = await resolveAssignmentId(projectId, memberId);
  const taskRole = normalizeTaskMemberRole(payload.role);
  const assignmentRole = mapTaskRoleToAssignmentRole(taskRole);

  const updated = await projectAssignmentService.updateAssignment(
    projectId,
    assignmentId,
    { role: assignmentRole },
    accountId,
    req
  );

  const taskMember = await taskMemberRepository.upsertActive({
    projectId,
    userId: updated.userId,
    role: taskRole,
    addedBy: accountId,
  });

  const assignment = await projectAssignmentRepository.findById(assignmentId, { projectId });
  return buildMemberDto(projectId, assignment, taskMember);
}

async function removeProjectMember(projectId, memberId, accountId, req = null) {
  await taskAccessService.assertProjectExists(projectId);

  const assignmentId = await resolveAssignmentId(projectId, memberId);
  const assignment = await projectAssignmentRepository.findById(assignmentId, { projectId });

  if (assignment) {
    await taskMemberRepository.deactivateByProjectAndUser(projectId, assignment.userId);
  }

  await projectAssignmentService.removeAssignment(projectId, assignmentId, accountId, req);
  return { success: true, deleted: true, id: assignmentId };
}

module.exports = {
  addProjectMember,
  updateProjectMember,
  removeProjectMember,
};
