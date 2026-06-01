const { AppError } = require('../../../kernel/errors');
const { BUDGET_STATUSES } = require('../constants/project.constants');
const projectErrorCodes = require('../errors/projectErrorCodes');
const {
  resolveApprovalStatus,
  resolveEntryType,
  affectsApprovedCapacity,
} = require('./budgetCapacity.helper');

const PENDING_LIFECYCLE_STATUSES = new Set([
  'draft',
  'pending',
  'pending_client_approval',
  'pending_admin_approval',
]);

const READ_ONLY_LIFECYCLE_STATUSES = new Set(['rejected', 'cancelled', 'consumed']);

function resolveBudgetLifecycleStatus(budget = {}) {
  const rawStatus = String(budget.status || '').trim().toLowerCase();
  if (rawStatus === 'consumed') return 'consumed';
  if (rawStatus === 'pending_client_approval') return 'pending_client_approval';
  if (rawStatus === 'pending_admin_approval') return 'pending_admin_approval';
  if (rawStatus && BUDGET_STATUSES.includes(rawStatus)) return rawStatus;

  const approvalStatus = resolveApprovalStatus(budget);
  if (approvalStatus === 'pending') return 'pending_admin_approval';
  return approvalStatus;
}

function isPendingLifecycleStatus(status) {
  return PENDING_LIFECYCLE_STATUSES.has(status);
}

function isReadOnlyLifecycleStatus(status) {
  return READ_ONLY_LIFECYCLE_STATUSES.has(status);
}

function isAdjustmentEntryType(entryType) {
  return entryType === 'adjustment';
}

function normalizeSignedMinutes(value, entryType) {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return 0;
  if (isAdjustmentEntryType(entryType)) return numeric;
  return Math.max(0, numeric);
}

function normalizeSignedAmount(value, entryType) {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return 0;
  if (isAdjustmentEntryType(entryType)) return numeric;
  return Math.max(0, numeric);
}

function countsTowardApprovedTotals(budget = {}) {
  const lifecycleStatus = resolveBudgetLifecycleStatus(budget);
  const approvalStatus = resolveApprovalStatus(budget);
  if (lifecycleStatus === 'consumed') return true;
  return affectsApprovedCapacity(approvalStatus);
}

function getBudgetApprovedMinutes(budget = {}) {
  return Number(budget.approvedMinutes || 0);
}

function calculateApprovedMinutesAfterRemoval(budgets = [], budgetToRemove = null) {
  const removeId = budgetToRemove?._id ? String(budgetToRemove._id) : null;
  let totalApprovedMinutes = 0;

  for (const budget of budgets) {
    if (budget.isDeleted) continue;
    if (removeId && String(budget._id) === removeId) continue;
    if (!countsTowardApprovedTotals(budget)) continue;
    totalApprovedMinutes += getBudgetApprovedMinutes(budget);
  }

  return totalApprovedMinutes;
}

function assertBudgetEditable(existingBudget, payload = {}) {
  const lifecycleStatus = resolveBudgetLifecycleStatus(existingBudget);

  if (isReadOnlyLifecycleStatus(lifecycleStatus)) {
    throw new AppError('Budget entry is read-only', {
      status: 400,
      code: projectErrorCodes.PROJECT_BUDGET_EDIT_BLOCKED,
      details: { lifecycleStatus },
    });
  }

  if (lifecycleStatus === 'consumed') {
    const allowedFields = new Set(['notes', 'description']);
    const attemptedFields = Object.keys(payload).filter((key) => payload[key] !== undefined);
    const blockedFields = attemptedFields.filter((key) => !allowedFields.has(key));
    if (blockedFields.length) {
      throw new AppError('Consumed budgets can only update notes or description', {
        status: 400,
        code: projectErrorCodes.PROJECT_BUDGET_EDIT_BLOCKED,
        details: { blockedFields },
      });
    }
    return;
  }

  if (lifecycleStatus === 'approved') {
    const blockedFields = [
      'requestedMinutes',
      'approvedMinutes',
      'requestedAmount',
      'approvedAmount',
      'budgetType',
      'entryType',
      'sourceType',
      'approvalStatus',
      'status',
      'periodStart',
      'periodEnd',
    ].filter((field) => payload[field] !== undefined);

    if (blockedFields.length) {
      throw new AppError(
        'Approved budget amounts cannot be edited. Create an adjustment entry instead.',
        {
          status: 400,
          code: projectErrorCodes.PROJECT_BUDGET_EDIT_BLOCKED,
          details: { blockedFields },
        }
      );
    }
  }
}

function assertBudgetCancellable(budget, allBudgets = [], projectStats = {}) {
  const lifecycleStatus = resolveBudgetLifecycleStatus(budget);

  if (isReadOnlyLifecycleStatus(lifecycleStatus)) {
    throw new AppError('Budget entry cannot be cancelled', {
      status: 400,
      code: projectErrorCodes.PROJECT_BUDGET_EDIT_BLOCKED,
      details: { lifecycleStatus },
    });
  }

  if (isPendingLifecycleStatus(lifecycleStatus)) {
    return;
  }

  if (lifecycleStatus !== 'approved') {
    return;
  }

  const consumedMinutes = Number(budget.consumedMinutes || 0);
  if (consumedMinutes > 0) {
    throw new AppError(
      'Cannot cancel an approved budget with logged time. Create an adjustment entry instead.',
      {
        status: 400,
        code: projectErrorCodes.PROJECT_BUDGET_CANCEL_BLOCKED_CONSUMED,
        details: { consumedMinutes },
      }
    );
  }

  const totalApprovedAfterCancel = calculateApprovedMinutesAfterRemoval(allBudgets, budget);
  const totalAssignedMinutes = Number(projectStats.totalAssignedMinutes || 0);
  const totalConsumedMinutes = Number(projectStats.totalConsumedMinutes || 0);

  if (totalApprovedAfterCancel < totalAssignedMinutes) {
    throw new AppError(
      'Cannot cancel this budget because assigned team capacity would exceed remaining approved capacity.',
      {
        status: 400,
        code: projectErrorCodes.PROJECT_BUDGET_CANCEL_BLOCKED_ASSIGNED,
        details: {
          totalApprovedMinutesAfterCancel: totalApprovedAfterCancel,
          totalAssignedMinutes,
        },
      }
    );
  }

  if (totalApprovedAfterCancel < totalConsumedMinutes) {
    throw new AppError(
      'Cannot cancel this budget because logged time would exceed remaining approved capacity.',
      {
        status: 400,
        code: projectErrorCodes.PROJECT_BUDGET_CANCEL_BLOCKED_CONSUMED,
        details: {
          totalApprovedMinutesAfterCancel: totalApprovedAfterCancel,
          totalConsumedMinutes,
        },
      }
    );
  }
}

module.exports = {
  resolveBudgetLifecycleStatus,
  isPendingLifecycleStatus,
  isReadOnlyLifecycleStatus,
  isAdjustmentEntryType,
  normalizeSignedMinutes,
  normalizeSignedAmount,
  countsTowardApprovedTotals,
  calculateApprovedMinutesAfterRemoval,
  assertBudgetEditable,
  assertBudgetCancellable,
};
