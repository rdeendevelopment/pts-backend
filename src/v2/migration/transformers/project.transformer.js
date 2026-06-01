const { buildNormalizedName, normalizeName, buildSourceHash } = require('../helpers/migrationBase.helper');
const {
  mapProjectStatus,
  mapProjectType,
  mapBudgetType,
  mapBudgetStatus,
  mapBudgetSourceType,
  mapAssignmentRole,
  mapAssignmentStatus,
  mapCapPeriod,
} = require('../helpers/enumMaps.helper');

function transformLegacyProject(doc, clientId) {
  const name = normalizeName(doc.title, '');
  if (!name) {
    return { error: { code: 'PROJECT_NAME_MISSING', message: 'Legacy project has no title.' } };
  }
  if (!clientId) {
    return { error: { code: 'PROJECT_CLIENT_MISSING', message: 'Legacy project client could not be resolved.' } };
  }

  return {
    payload: {
      clientId,
      name,
      normalizedName: buildNormalizedName(name),
      description: doc.detail || doc.notes || null,
      type: mapProjectType(doc.projectType),
      status: mapProjectStatus(doc),
      dueDate: doc.deadline || null,
      allowBudgetExceed: doc.allowBudgetExceed !== false,
      billingType: 'billable',
      isDeleted: Boolean(doc.isDeleted),
      deletedAt: doc.isDeleted ? doc.updatedAt || new Date() : null,
    },
    statsPayload: { projectId: null },
    sourceHash: buildSourceHash(doc, 'projects'),
    legacyId: doc.legacyId ?? null,
    oldObjectId: doc._id,
  };
}

function transformLegacyBudget(doc, projectId) {
  if (!projectId) {
    return { error: { code: 'PROJECT_CLIENT_MISSING', message: 'Budget project could not be resolved.' } };
  }

  const allocatedMinutes = Number(doc.allocatedMinutes || 0);
  const consumedMinutes = Number(doc.consumedMinutes || 0);

  return {
    payload: {
      projectId,
      title: normalizeName(doc.name, 'Budget'),
      description: doc.description || null,
      sourceType: mapBudgetSourceType(doc.budgetType),
      budgetType: mapBudgetType(doc.budgetType),
      status: mapBudgetStatus(doc.status),
      requestedMinutes: allocatedMinutes,
      approvedMinutes: allocatedMinutes,
      consumedMinutes,
      periodStart: doc.startDate || null,
      periodEnd: doc.endDate || null,
      isDeleted: false,
    },
    sourceHash: buildSourceHash(doc, 'project_budgets'),
    legacyId: doc.legacyId ?? null,
    oldObjectId: doc._id,
  };
}

function transformLegacyAssignment(doc, projectId, userId) {
  if (!projectId || !userId) {
    return { error: { code: 'MISSING_PROJECT_MAP', message: 'Assignment project/user could not be resolved.' } };
  }

  const allocatedMinutes = Number(doc.hoursCapMinutes || 0);
  const status = mapAssignmentStatus(doc);

  return {
    payload: {
      projectId,
      userId,
      role: mapAssignmentRole(doc.assignedRole),
      status,
      allocation: {
        allocatedMinutes,
        capPeriod: mapCapPeriod(doc.capPeriod),
        allowExceed: false,
        canLogTime: doc.canLogTime !== false,
      },
      stats: {
        consumedMinutes: 0,
        remainingMinutes: allocatedMinutes,
      },
      assignedAt: doc.assignedAt || doc.assignDate || doc.createdAt || null,
      isDeleted: Boolean(doc.isDeleted) || status === 'removed',
      deletedAt: doc.isDeleted ? doc.updatedAt || new Date() : null,
    },
    sourceHash: buildSourceHash(doc, 'project_assignments'),
    legacyId: doc.legacyId ?? null,
    oldObjectId: doc._id,
  };
}

function buildEmptyProjectStats(projectId) {
  return {
    projectId,
    totalApprovedMinutes: 0,
    totalApprovedAmount: 0,
    totalPendingMinutes: 0,
    totalPendingAmount: 0,
    totalAssignedMinutes: 0,
    totalConsumedMinutes: 0,
    totalRemainingMinutes: 0,
    totalAvailableToAssignMinutes: 0,
    totalMembers: 0,
    totalBudgets: 0,
    totalFiles: 0,
    lastActivityAt: null,
    recalculatedAt: new Date(),
  };
}

module.exports = {
  transformLegacyProject,
  transformLegacyBudget,
  transformLegacyAssignment,
  buildEmptyProjectStats,
};
