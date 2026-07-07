const {
  calculateRemainingMinutes,
  calculateAvailableToAssignMinutes,
} = require('../helpers/assignment.helper');
const { mapBudgetTotals, sumBudgetConsumedMinutes } = require('../helpers/budget.helper');
const projectRepository = require('../repositories/project.repository');
const projectBudgetRepository = require('../repositories/projectBudget.repository');
const projectAssignmentRepository = require('../repositories/projectAssignment.repository');
const projectFileRepository = require('../repositories/projectFile.repository');
const projectStatsRepository = require('../repositories/projectStats.repository');

async function recalculateStats(projectId) {
  const [project, budgets, assignments, totalFiles, totalMembers] = await Promise.all([
    projectRepository.findById(projectId),
    projectBudgetRepository.listByProjectId(projectId),
    projectAssignmentRepository.listByProjectId(projectId, { status: 'active' }),
    projectFileRepository.countByProjectId(projectId),
    projectAssignmentRepository.countActiveMembers(projectId),
  ]);

  const budgetOptions = {
    projectType: project?.type || null,
    referenceDate: new Date(),
    renewalDay: project?.retainerRenewalDay || 1,
  };
  const budgetTotals = mapBudgetTotals(budgets, budgetOptions);
  const budgetConsumedMinutes = sumBudgetConsumedMinutes(budgets, budgetOptions);

  let totalAssignedMinutes = 0;
  let assignmentConsumedMinutes = 0;

  for (const assignment of assignments) {
    totalAssignedMinutes += Number(assignment.allocation?.allocatedMinutes || 0);
    assignmentConsumedMinutes += Number(assignment.stats?.consumedMinutes || 0);
  }

  // Use the higher of assignment roll-up vs budget roll-up so KPIs match capacity timeline.
  const totalConsumedMinutes = Math.max(assignmentConsumedMinutes, budgetConsumedMinutes);

  const totalRemainingMinutes = calculateRemainingMinutes(
    budgetTotals.totalApprovedMinutes,
    totalConsumedMinutes
  );

  const totalAvailableToAssignMinutes = calculateAvailableToAssignMinutes(
    budgetTotals.totalApprovedMinutes,
    totalAssignedMinutes
  );

  const payload = {
    ...budgetTotals,
    totalAssignedMinutes,
    totalConsumedMinutes,
    totalRemainingMinutes,
    totalAvailableToAssignMinutes,
    totalMembers,
    totalBudgets: budgets.filter((b) => !b.isDeleted).length,
    totalFiles,
    recalculatedAt: new Date(),
  };

  return projectStatsRepository.upsertStats(projectId, payload);
}

async function getStats(projectId) {
  const retainerRenewalService = require('./retainerRenewal.service');
  await retainerRenewalService.ensureRetainerBudgetOnAccess(projectId);
  let stats = await projectStatsRepository.findByProjectId(projectId);
  if (!stats) {
    stats = await recalculateStats(projectId);
  }
  return stats;
}

async function createInitialStats(projectId) {
  return projectStatsRepository.createStats({ projectId });
}

function buildAssignmentScopedStats(projectId, assignment) {
  const allocatedMinutes = Number(assignment?.allocation?.allocatedMinutes || 0);
  const consumedMinutes = Number(assignment?.stats?.consumedMinutes || 0);
  const remainingMinutes = Number(
    assignment?.stats?.remainingMinutes ?? Math.max(0, allocatedMinutes - consumedMinutes)
  );

  return {
    _id: null,
    projectId,
    totalApprovedMinutes: allocatedMinutes,
    totalApprovedAmount: 0,
    totalPendingMinutes: 0,
    totalPendingAmount: 0,
    totalAssignedMinutes: allocatedMinutes,
    totalConsumedMinutes: consumedMinutes,
    totalRemainingMinutes: remainingMinutes,
    totalAvailableToAssignMinutes: 0,
    totalMembers: assignment ? 1 : 0,
    totalBudgets: 0,
    totalFiles: 0,
    lastActivityAt: null,
    recalculatedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * List-safe stats resolution: one batch read from pts_project_stats, optional
 * recalculation only for projects with no cached row (e.g. newly created).
 */
async function resolveStatsForList(projectIds = []) {
  const normalizedIds = projectIds.filter(Boolean);
  if (!normalizedIds.length) {
    return {
      statsByProjectId: new Map(),
      cachedFound: 0,
      missingCount: 0,
      fallbackRecalculated: 0,
    };
  }

  const cachedRows = await projectStatsRepository.findByProjectIds(normalizedIds);
  const statsByProjectId = new Map(
    cachedRows.map((row) => [String(row.projectId), row])
  );

  const missingIds = normalizedIds.filter((id) => !statsByProjectId.has(String(id)));
  let fallbackRecalculated = 0;

  if (missingIds.length) {
    const recalculatedRows = await Promise.all(
      missingIds.map((projectId) => recalculateStats(projectId))
    );
    recalculatedRows.forEach((row) => {
      if (row) statsByProjectId.set(String(row.projectId), row);
    });
    fallbackRecalculated = missingIds.length;
  }

  return {
    statsByProjectId,
    cachedFound: cachedRows.length,
    missingCount: missingIds.length,
    fallbackRecalculated,
  };
}

module.exports = {
  recalculateStats,
  getStats,
  createInitialStats,
  buildAssignmentScopedStats,
  resolveStatsForList,
};
