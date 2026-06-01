const { AppError } = require('../../../kernel/errors');
const {
  ASSIGNMENT_ROLES,
  ASSIGNMENT_STATUSES,
  CAP_PERIODS,
} = require('../constants/project.constants');
const projectErrorCodes = require('../errors/projectErrorCodes');
const {
  calculateRemainingMinutes,
  calculateAvailableForAssignmentUpdate,
  assertAllocationWithinAvailable,
  defaultCanLogTimeForRole,
} = require('../helpers/assignment.helper');
const userRepository = require('../../users/repositories/user.repository');
const projectAssignmentRepository = require('../repositories/projectAssignment.repository');
const projectService = require('./project.service');
const projectStatsService = require('./projectStats.service');
const projectEventService = require('./projectEvent.service');
const { toProjectAssignmentDto } = require('../dto/project.dto');
const {
  ensureApprovedCapacityCoversAssignments,
} = require('../helpers/assignmentCapacityBudget.helper');

async function getAssignmentOrThrow(projectId, assignmentId) {
  const assignment = await projectAssignmentRepository.findById(assignmentId, { projectId });
  if (!assignment) {
    throw new AppError('Project assignment not found', {
      status: 404,
      code: projectErrorCodes.PROJECT_ASSIGNMENT_NOT_FOUND,
    });
  }
  return assignment;
}

async function assertUserExists(userId) {
  const user = await userRepository.findById(userId);
  if (!user || user.isDeleted) {
    throw new AppError('User not found for assignment', {
      status: 404,
      code: projectErrorCodes.PROJECT_USER_NOT_FOUND,
      details: { userId: String(userId) },
    });
  }
  return user;
}

function buildAssignmentPayload(payload, accountId, { forUpdate = false, existing = null } = {}) {
  const data = {};

  if (payload.userId !== undefined) data.userId = payload.userId;

  if (payload.role !== undefined) {
    if (!ASSIGNMENT_ROLES.includes(payload.role)) {
      throw new AppError('Invalid assignment role', {
        status: 400,
        code: projectErrorCodes.PROJECT_ASSIGNMENT_NOT_FOUND,
        details: { allowed: ASSIGNMENT_ROLES },
      });
    }
    data.role = payload.role;
  } else if (!forUpdate) {
    data.role = 'member';
  }

  if (payload.status !== undefined) {
    if (!ASSIGNMENT_STATUSES.includes(payload.status)) {
      throw new AppError('Invalid assignment status', {
        status: 400,
        code: projectErrorCodes.PROJECT_ASSIGNMENT_NOT_FOUND,
        details: { allowed: ASSIGNMENT_STATUSES },
      });
    }
    data.status = payload.status;
  } else if (!forUpdate) {
    data.status = 'active';
  }

  const role = data.role || existing?.role || 'member';
  const existingAllocation = existing?.allocation || {};
  const allocationSource = payload.allocation || payload;

  const allocatedMinutes = allocationSource.allocatedMinutes ?? allocationSource.allocated_minutes;
  const capPeriod = allocationSource.capPeriod ?? allocationSource.cap_period;
  const allowExceed = allocationSource.allowExceed ?? allocationSource.allow_exceed;
  const canLogTime = allocationSource.canLogTime ?? allocationSource.can_log_time;

  if (
    allocatedMinutes !== undefined
    || capPeriod !== undefined
    || allowExceed !== undefined
    || canLogTime !== undefined
    || !forUpdate
  ) {
    if (capPeriod !== undefined && !CAP_PERIODS.includes(capPeriod)) {
      throw new AppError('Invalid cap period', {
        status: 400,
        code: projectErrorCodes.PROJECT_ASSIGNMENT_NOT_FOUND,
        details: { allowed: CAP_PERIODS },
      });
    }

    data.allocation = {
      allocatedMinutes: Math.max(
        0,
        Number(allocatedMinutes ?? existingAllocation.allocatedMinutes ?? 0)
      ),
      capPeriod: capPeriod || existingAllocation.capPeriod || 'project',
      allowExceed: allowExceed !== undefined
        ? Boolean(allowExceed)
        : existingAllocation.allowExceed ?? false,
      canLogTime: canLogTime !== undefined
        ? Boolean(canLogTime)
        : existingAllocation.canLogTime ?? defaultCanLogTimeForRole(role),
    };
  }

  if (data.allocation && data.role === 'viewer' && canLogTime === undefined) {
    data.allocation.canLogTime = false;
  }

  if (!forUpdate) {
    data.assignedBy = accountId;
    data.assignedAt = new Date();
    data.createdBy = accountId;
  }

  data.updatedBy = accountId;
  return data;
}

async function validateAllocationAgainstProject(project, stats, requestedMinutes, currentAllocatedMinutes = 0) {
  const available = currentAllocatedMinutes > 0
    ? calculateAvailableForAssignmentUpdate(stats, currentAllocatedMinutes)
    : stats.totalAvailableToAssignMinutes;

  const result = assertAllocationWithinAvailable({
    requestedMinutes,
    availableMinutes: available,
    allowBudgetExceed: project.allowBudgetExceed,
  });

  if (!result.allowed) {
    throw new AppError('Assignment exceeds available project hours', {
      status: 409,
      code: projectErrorCodes.PROJECT_ASSIGNMENT_EXCEEDS_AVAILABLE_HOURS,
      details: {
        requestedMinutes: result.requested,
        availableMinutes: result.available,
      },
    });
  }
}

function withRemainingStats(assignmentData, existing = null) {
  const allocated = assignmentData.allocation?.allocatedMinutes ?? 0;
  const consumed = existing?.stats?.consumedMinutes ?? 0;
  assignmentData.stats = {
    consumedMinutes: consumed,
    remainingMinutes: calculateRemainingMinutes(allocated, consumed),
  };
  return assignmentData;
}

async function listAssignments(projectId) {
  await projectService.getProjectOrThrow(projectId);
  const assignments = await projectAssignmentRepository.listByProjectId(projectId);
  return assignments.map(toProjectAssignmentDto);
}

async function createAssignment(projectId, payload, accountId, req = null) {
  const project = await projectService.getProjectOrThrow(projectId);
  await assertUserExists(payload.userId);

  const existing = await projectAssignmentRepository.findByProjectAndUser(projectId, payload.userId);
  if (existing) {
    throw new AppError('User is already assigned to project', {
      status: 409,
      code: projectErrorCodes.PROJECT_USER_ALREADY_ASSIGNED,
      details: { userId: String(payload.userId) },
    });
  }

  const data = buildAssignmentPayload(payload, accountId);
  withRemainingStats(data);

  const stats = await projectStatsService.getStats(projectId);
  await validateAllocationAgainstProject(
    project,
    stats,
    data.allocation.allocatedMinutes
  );

  const assignment = await projectAssignmentRepository.createAssignment({
    ...data,
    projectId,
  });

  await ensureApprovedCapacityCoversAssignments(project, accountId, req);
  await projectStatsService.recalculateStats(projectId);

  await projectEventService.recordEvent({
    projectId,
    eventType: 'PROJECT_MEMBER_ASSIGNED',
    title: 'Project member assigned',
    performedBy: accountId,
    metadata: {
      assignmentId: String(assignment._id),
      userId: String(assignment.userId),
      role: assignment.role,
    },
    req,
  });

  return toProjectAssignmentDto(assignment);
}

async function updateAssignment(projectId, assignmentId, payload, accountId, req = null) {
  const project = await projectService.getProjectOrThrow(projectId);
  const existing = await getAssignmentOrThrow(projectId, assignmentId);

  if (payload.userId && String(payload.userId) !== String(existing.userId)) {
    await assertUserExists(payload.userId);
    const duplicate = await projectAssignmentRepository.findByProjectAndUser(projectId, payload.userId);
    if (duplicate && String(duplicate._id) !== String(existing._id)) {
      throw new AppError('User is already assigned to project', {
        status: 409,
        code: projectErrorCodes.PROJECT_USER_ALREADY_ASSIGNED,
      });
    }
  }

  const updates = buildAssignmentPayload(payload, accountId, { forUpdate: true, existing });
  withRemainingStats(updates, existing);

  if (updates.allocation) {
    const stats = await projectStatsService.getStats(projectId);
    await validateAllocationAgainstProject(
      project,
      stats,
      updates.allocation.allocatedMinutes,
      existing.allocation?.allocatedMinutes || 0
    );
  }

  const assignment = await projectAssignmentRepository.updateAssignment(
    assignmentId,
    projectId,
    updates
  );

  if (updates.allocation) {
    await ensureApprovedCapacityCoversAssignments(project, accountId, req);
  }
  await projectStatsService.recalculateStats(projectId);

  await projectEventService.recordEvent({
    projectId,
    eventType: 'PROJECT_MEMBER_UPDATED',
    title: 'Project member updated',
    performedBy: accountId,
    metadata: { assignmentId: String(assignment._id) },
    req,
  });

  return toProjectAssignmentDto(assignment);
}

async function removeAssignment(projectId, assignmentId, accountId, req = null) {
  await projectService.getProjectOrThrow(projectId);
  const existing = await getAssignmentOrThrow(projectId, assignmentId);

  await projectAssignmentRepository.softRemoveAssignment(assignmentId, projectId, {
    removedBy: accountId,
    updatedBy: accountId,
  });

  await projectStatsService.recalculateStats(projectId);

  await projectEventService.recordEvent({
    projectId,
    eventType: 'PROJECT_MEMBER_REMOVED',
    title: 'Project member removed',
    performedBy: accountId,
    metadata: { assignmentId: String(existing._id), userId: String(existing.userId) },
    req,
  });

  return { deleted: true, id: String(assignmentId) };
}

module.exports = {
  listAssignments,
  createAssignment,
  updateAssignment,
  removeAssignment,
};
