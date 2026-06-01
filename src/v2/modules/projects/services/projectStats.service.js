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

module.exports = {
  recalculateStats,
  getStats,
  createInitialStats,
};
