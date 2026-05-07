const { CoreProject } = require('../MongoModels');
const budgetRepo = require('../Repositories/budget.repository');

function createInitialProjectBudgets(actorId, projectId, projectType, data, options = {}) {
  return budgetRepo.createInitialBudgetSkeletons(actorId, projectId, projectType, data, options);
}

function getBudgets(projectId) {
  return budgetRepo.getBudgets(projectId);
}

function createBudget(actorId, projectId, data) {
  return budgetRepo.createBudget(actorId, projectId, data);
}

function updateBudget(actorId, projectId, budgetId, data) {
  return budgetRepo.updateBudget(actorId, projectId, budgetId, data);
}

function deleteBudget(projectId, budgetId) {
  return budgetRepo.deleteBudget(projectId, budgetId);
}

function getBudgetSummary(projectId) {
  return budgetRepo.getBudgetSummary(projectId);
}

function createBudgetRequest(actorId, projectId, data) {
  return budgetRepo.createBudgetRequest(actorId, projectId, data);
}

function getBudgetRequests(projectId) {
  return budgetRepo.getBudgetRequests(projectId);
}

function approveBudgetRequest(actorId, projectId, requestId) {
  return budgetRepo.approveBudgetRequest(actorId, projectId, requestId);
}

function rejectBudgetRequest(actorId, projectId, requestId) {
  return budgetRepo.rejectBudgetRequest(actorId, projectId, requestId);
}

function createNextRetainerBudget(actorId, projectId) {
  return (async () => {
    const projectData = await CoreProject.findOne({ legacyId: Number(projectId), isDeleted: false }).lean();
    await budgetRepo.createRetainerBudgetForRange(actorId, projectId, projectData || {}, budgetRepo.monthRange(new Date(), 1));
    return getBudgets(projectId);
  })();
}

async function createCurrentRetainerBudget(actorId, projectId, projectData, options = {}) {
  const source = projectData || await CoreProject.findOne({ legacyId: Number(projectId), isDeleted: false }).lean();
  await budgetRepo.createInitialBudgetSkeletons(actorId, projectId, 'retainer', source || {}, options);
  return getBudgets(projectId);
}

function resolveBudgetForTimeEntry(projectId, requestedBudgetId) {
  return budgetRepo.resolveBudgetForTimeEntry(projectId, requestedBudgetId);
}

function assertBudgetCanConsume(budgetId, newDurationMinutes, excludeEntryId = null) {
  return budgetRepo.assertBudgetCanConsume(budgetId, newDurationMinutes, excludeEntryId);
}

function recalculateBudget(budgetId) {
  return budgetRepo.recalculateBudget(budgetId);
}

function refreshProjectBudgets(projectId) {
  return budgetRepo.refreshProjectBudgets(projectId);
}

function nextRetainerBudgetPreview(projectData) {
  const hours = Number(projectData?.retainer_hours_per_month || projectData?.retainerHoursPerMonth || 0);
  const start = new Date();
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const label = next.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return hours > 0 ? `${label} Retainer · ${hours}h` : `${label} Retainer`;
}

module.exports = {
  ACTIVE_BUDGET_STATUSES: budgetRepo.ACTIVE_BUDGET_STATUSES,
  labelMinutes: budgetRepo.labelMinutes,
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
  createBudgetRequest,
  getBudgetRequests,
  approveBudgetRequest,
  rejectBudgetRequest,
  createCurrentRetainerBudget,
  createNextRetainerBudget,
  createInitialProjectBudgets,
  nextRetainerBudgetPreview,
  resolveBudgetForTimeEntry,
  assertBudgetCanConsume,
  recalculateBudget,
  refreshProjectBudgets,
};
