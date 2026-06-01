const routes = require('./projects.routes');
const { ensureProjectModuleIndexes } = require('./models');
const projectRepository = require('./repositories/project.repository');
const projectActivityIntegration = require('./services/projectActivityIntegration.service');

async function clientHasActiveProjects(clientId) {
  const count = await projectRepository.countActiveByClientId(clientId);
  return count > 0;
}

module.exports = {
  routes,
  ensureProjectModuleIndexes,
  clientHasActiveProjects,
  getProjectForActivity: projectActivityIntegration.getProjectForActivity,
  getAssignmentForUser: projectActivityIntegration.getAssignmentForUser,
  getApprovedBudgetsForProject: projectActivityIntegration.getApprovedBudgetsForProject,
  incrementAssignmentConsumedMinutes: projectActivityIntegration.incrementAssignmentConsumedMinutes,
  incrementBudgetConsumedMinutes: projectActivityIntegration.incrementBudgetConsumedMinutes,
  reverseAssignmentConsumedMinutes: projectActivityIntegration.reverseAssignmentConsumedMinutes,
  reverseBudgetConsumedMinutes: projectActivityIntegration.reverseBudgetConsumedMinutes,
  recalculateProjectStats: projectActivityIntegration.recalculateProjectStats,
  emitProjectEvent: projectActivityIntegration.emitProjectEvent,
  getProjectStats: projectActivityIntegration.getProjectStats,
};
