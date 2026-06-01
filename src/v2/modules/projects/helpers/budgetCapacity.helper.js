const {
  BUDGET_ENTRY_TYPES,
  BUDGET_APPROVAL_STATUSES,
  BUDGET_SOURCE_TYPES,
  BUDGET_STATUSES,
} = require('../constants/project.constants');

const LEGACY_SOURCE_TO_ENTRY = {
  initial: 'initial',
  extra_hours: 'extension',
  feature_request: 'change_request',
  scope_change: 'change_request',
  manual_adjustment: 'adjustment',
  retainer_month: 'retainer_cycle',
  retainer_renewal: 'retainer_cycle',
};

const ENTRY_TO_LEGACY_SOURCE = {
  initial: 'initial',
  extension: 'extra_hours',
  change_request: 'scope_change',
  retainer_cycle: 'retainer_month',
  adjustment: 'manual_adjustment',
};

const LEGACY_STATUS_TO_APPROVAL = {
  draft: 'draft',
  pending_client_approval: 'pending',
  pending_admin_approval: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
  consumed: 'cancelled',
};

const APPROVAL_TO_LEGACY_STATUS = {
  draft: 'draft',
  pending: 'pending_admin_approval',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

function resolveEntryType(budget = {}) {
  if (budget.entryType && BUDGET_ENTRY_TYPES.includes(budget.entryType)) {
    return budget.entryType;
  }
  if (budget.sourceType && LEGACY_SOURCE_TO_ENTRY[budget.sourceType]) {
    return LEGACY_SOURCE_TO_ENTRY[budget.sourceType];
  }
  return 'adjustment';
}

function resolveApprovalStatus(budget = {}) {
  if (budget.approvalStatus && BUDGET_APPROVAL_STATUSES.includes(budget.approvalStatus)) {
    return budget.approvalStatus;
  }
  if (budget.status && LEGACY_STATUS_TO_APPROVAL[budget.status]) {
    return LEGACY_STATUS_TO_APPROVAL[budget.status];
  }
  return 'draft';
}

function affectsApprovedCapacity(approvalStatus) {
  return approvalStatus === 'approved';
}

function countsAsPendingCapacity(approvalStatus) {
  return approvalStatus === 'draft' || approvalStatus === 'pending';
}

function isInactiveCapacityStatus(approvalStatus) {
  return approvalStatus === 'rejected' || approvalStatus === 'cancelled';
}

function normalizeEntryTypeInput(value) {
  const raw = String(value || '').trim();
  if (BUDGET_ENTRY_TYPES.includes(raw)) return raw;
  if (LEGACY_SOURCE_TO_ENTRY[raw]) return LEGACY_SOURCE_TO_ENTRY[raw];
  return null;
}

function normalizeApprovalStatusInput(value, { defaultStatus = 'pending' } = {}) {
  const raw = String(value || '').trim();
  if (BUDGET_APPROVAL_STATUSES.includes(raw)) return raw;
  if (LEGACY_STATUS_TO_APPROVAL[raw]) return LEGACY_STATUS_TO_APPROVAL[raw];
  return defaultStatus;
}

function syncBudgetCanonicalFields(data = {}) {
  const next = { ...data };

  const entryType = normalizeEntryTypeInput(next.entryType || next.sourceType);
  if (entryType) {
    next.entryType = entryType;
    next.sourceType = next.sourceType || ENTRY_TO_LEGACY_SOURCE[entryType];
    if (!BUDGET_SOURCE_TYPES.includes(next.sourceType)) {
      next.sourceType = ENTRY_TO_LEGACY_SOURCE[entryType];
    }
  }

  const approvalStatus = normalizeApprovalStatusInput(
    next.approvalStatus || next.status,
    { defaultStatus: next.approvalStatus || next.status ? 'draft' : undefined },
  );
  if (approvalStatus) {
    next.approvalStatus = approvalStatus;
    next.status = next.status || APPROVAL_TO_LEGACY_STATUS[approvalStatus];
    if (!BUDGET_STATUSES.includes(next.status)) {
      next.status = APPROVAL_TO_LEGACY_STATUS[approvalStatus];
    }
  }

  return next;
}

function resolveInitialBudgetApprovalStatus(project, initialBudget = {}) {
  if (
    project.status === 'active'
    && project.settings?.autoApproveInitialBudgetOnActivation !== false
  ) {
    return 'approved';
  }

  const fromPayload = normalizeApprovalStatusInput(
    initialBudget.approvalStatus || initialBudget.status,
    { defaultStatus: 'pending' },
  );
  return fromPayload || 'pending';
}

module.exports = {
  LEGACY_SOURCE_TO_ENTRY,
  ENTRY_TO_LEGACY_SOURCE,
  LEGACY_STATUS_TO_APPROVAL,
  APPROVAL_TO_LEGACY_STATUS,
  resolveEntryType,
  resolveApprovalStatus,
  affectsApprovedCapacity,
  countsAsPendingCapacity,
  isInactiveCapacityStatus,
  normalizeEntryTypeInput,
  normalizeApprovalStatusInput,
  syncBudgetCanonicalFields,
  resolveInitialBudgetApprovalStatus,
};
