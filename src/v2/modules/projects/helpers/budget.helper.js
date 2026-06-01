const {
  BUDGET_STATUSES,
} = require('../constants/project.constants');
const {
  resolveApprovalStatus,
  affectsApprovedCapacity,
  countsAsPendingCapacity,
  isInactiveCapacityStatus,
  resolveInitialBudgetApprovalStatus,
} = require('./budgetCapacity.helper');
const { countsTowardApprovedTotals } = require('./budget.lifecycle.helper');
const { budgetCountsForRetainerCapacity } = require('./retainerPeriod.helper');

function countsTowardApprovedCapacity(statusOrBudget) {
  const approvalStatus = typeof statusOrBudget === 'string'
    ? resolveApprovalStatus({ approvalStatus: statusOrBudget, status: statusOrBudget })
    : resolveApprovalStatus(statusOrBudget);
  return affectsApprovedCapacity(approvalStatus);
}

function countsAsPending(statusOrBudget) {
  const approvalStatus = typeof statusOrBudget === 'string'
    ? resolveApprovalStatus({ approvalStatus: statusOrBudget, status: statusOrBudget })
    : resolveApprovalStatus(statusOrBudget);
  return countsAsPendingCapacity(approvalStatus);
}

function isInactiveBudgetStatus(statusOrBudget) {
  const approvalStatus = typeof statusOrBudget === 'string'
    ? resolveApprovalStatus({ approvalStatus: statusOrBudget, status: statusOrBudget })
    : resolveApprovalStatus(statusOrBudget);
  return isInactiveCapacityStatus(approvalStatus);
}

function validateBudgetTypeForProject(projectType, budgetType) {
  if (projectType === 'fixed_budget' && budgetType !== 'money') {
    return { valid: false, reason: 'fixed_budget projects only accept money budgets' };
  }
  if (projectType === 'fixed_hours' && budgetType !== 'hours') {
    return { valid: false, reason: 'fixed_hours projects only accept hours budgets' };
  }
  if (projectType === 'fixed_budget' && budgetType === 'money') {
    return { valid: true };
  }
  if (projectType === 'fixed_hours' && budgetType === 'hours') {
    return { valid: true };
  }
  if (projectType === 'hybrid' && budgetType === 'hybrid') {
    return { valid: true };
  }
  if (projectType === 'hybrid' && (budgetType === 'money' || budgetType === 'hours')) {
    return { valid: true };
  }
  if (['retainer', 'internal'].includes(projectType)) {
    return { valid: true };
  }
  if (projectType === 'fixed_budget' || projectType === 'fixed_hours') {
    return { valid: false, reason: 'budget type does not match project type' };
  }
  return { valid: true };
}

function resolveInitialBudgetStatus(project, initialBudget = {}) {
  const approvalStatus = resolveInitialBudgetApprovalStatus(project, initialBudget);
  if (approvalStatus === 'approved') return 'approved';
  if (approvalStatus === 'pending') return 'pending_admin_approval';
  if (approvalStatus === 'draft') return 'draft';
  if (initialBudget.status && BUDGET_STATUSES.includes(initialBudget.status)) {
    return initialBudget.status;
  }
  return 'pending_admin_approval';
}

function shouldIncludeBudgetInTotals(budget, { projectType = null, referenceDate = new Date(), renewalDay = 1 } = {}) {
  if (projectType === 'retainer') {
    return budgetCountsForRetainerCapacity(budget, referenceDate, renewalDay);
  }
  return true;
}

function mapBudgetTotals(budgets = [], options = {}) {
  let totalApprovedMinutes = 0;
  let totalApprovedAmount = 0;
  let totalPendingMinutes = 0;
  let totalPendingAmount = 0;

  for (const budget of budgets) {
    if (budget.isDeleted) continue;

    const approvalStatus = resolveApprovalStatus(budget);

    if (budget.isDeleted || isInactiveCapacityStatus(approvalStatus)) {
      continue;
    }

    if (!shouldIncludeBudgetInTotals(budget, options)) {
      continue;
    }

    if (countsTowardApprovedTotals(budget)) {
      totalApprovedMinutes += Number(budget.approvedMinutes || 0);
      totalApprovedAmount += Number(budget.approvedAmount || 0);
    } else if (countsAsPendingCapacity(approvalStatus)) {
      totalPendingMinutes += Number(budget.requestedMinutes || budget.approvedMinutes || 0);
      totalPendingAmount += Number(budget.requestedAmount || budget.approvedAmount || 0);
    }
  }

  return {
    totalApprovedMinutes,
    totalApprovedAmount,
    totalPendingMinutes,
    totalPendingAmount,
  };
}

/** Sum consumed minutes on approved capacity budgets (source of truth for time logged). */
function sumBudgetConsumedMinutes(budgets = [], options = {}) {
  let total = 0;

  for (const budget of budgets) {
    if (budget.isDeleted) continue;
    if (!countsTowardApprovedCapacity(budget)) continue;
    if (!shouldIncludeBudgetInTotals(budget, options)) continue;
    total += Number(budget.consumedMinutes || 0);
  }

  return total;
}

module.exports = {
  countsTowardApprovedCapacity,
  countsAsPending,
  isInactiveBudgetStatus,
  validateBudgetTypeForProject,
  resolveInitialBudgetStatus,
  shouldIncludeBudgetInTotals,
  mapBudgetTotals,
  sumBudgetConsumedMinutes,
};
