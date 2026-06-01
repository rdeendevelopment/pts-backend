const { AppError } = require('../../../kernel/errors');
const {
  BUDGET_TYPES,
  DEFAULT_CURRENCY,
} = require('../constants/project.constants');
const projectErrorCodes = require('../errors/projectErrorCodes');
const { validateBudgetTypeForProject } = require('../helpers/budget.helper');
const {
  normalizeEntryTypeInput,
  normalizeApprovalStatusInput,
  syncBudgetCanonicalFields,
  affectsApprovedCapacity,
} = require('../helpers/budgetCapacity.helper');
const {
  assertBudgetEditable,
  assertBudgetCancellable,
  isAdjustmentEntryType,
  normalizeSignedMinutes,
  normalizeSignedAmount,
  resolveBudgetLifecycleStatus,
} = require('../helpers/budget.lifecycle.helper');
const projectBudgetRepository = require('../repositories/projectBudget.repository');
const projectService = require('./project.service');
const projectStatsService = require('./projectStats.service');
const projectEventService = require('./projectEvent.service');
const retainerRenewalService = require('./retainerRenewal.service');
const {
  toProjectBudgetDto,
  toProjectStatsDto,
} = require('../dto/project.dto');

function assertValidApprovalStatus(approvalStatus) {
  const normalized = normalizeApprovalStatusInput(approvalStatus, { defaultStatus: null });
  if (!normalized) {
    throw new AppError('Invalid budget approval status', {
      status: 400,
      code: projectErrorCodes.PROJECT_BUDGET_INVALID_STATUS,
    });
  }
}

async function getBudgetOrThrow(projectId, budgetId) {
  const budget = await projectBudgetRepository.findById(budgetId, { projectId });
  if (!budget) {
    throw new AppError('Project budget not found', {
      status: 404,
      code: projectErrorCodes.PROJECT_BUDGET_NOT_FOUND,
    });
  }
  return budget;
}

async function buildMutationResponse(projectId, budget = null) {
  const [budgets, stats] = await Promise.all([
    projectBudgetRepository.listByProjectId(projectId),
    projectStatsService.getStats(projectId),
  ]);

  return {
    budget: budget ? toProjectBudgetDto(budget) : null,
    items: budgets.map(toProjectBudgetDto),
    stats: toProjectStatsDto(stats),
  };
}

function buildBudgetPayload(payload, project, accountId, { forUpdate = false, existingBudget = null } = {}) {
  const data = {};
  const entryType = normalizeEntryTypeInput(
    payload.entryType
    || payload.sourceType
    || existingBudget?.entryType
    || existingBudget?.sourceType
  );

  if (payload.title !== undefined) data.title = String(payload.title).trim();
  if (payload.description !== undefined) data.description = payload.description || null;

  if (entryType) data.entryType = entryType;

  if (payload.budgetType !== undefined) {
    if (!BUDGET_TYPES.includes(payload.budgetType)) {
      throw new AppError('Invalid budget type', {
        status: 400,
        code: projectErrorCodes.PROJECT_BUDGET_INVALID_STATUS,
      });
    }
    const typeCheck = validateBudgetTypeForProject(project.type, payload.budgetType);
    if (!typeCheck.valid) {
      throw new AppError(typeCheck.reason, {
        status: 400,
        code: projectErrorCodes.PROJECT_TYPE_REQUIREMENTS_FAILED,
        details: { projectType: project.type, budgetType: payload.budgetType },
      });
    }
    data.budgetType = payload.budgetType;
  }

  const resolvedEntryType = entryType
    || normalizeEntryTypeInput(existingBudget?.entryType || existingBudget?.sourceType);

  if (payload.requestedAmount !== undefined) {
    data.requestedAmount = normalizeSignedAmount(payload.requestedAmount, resolvedEntryType);
  }
  if (payload.approvedAmount !== undefined) {
    data.approvedAmount = normalizeSignedAmount(payload.approvedAmount, resolvedEntryType);
  }
  if (payload.requestedMinutes !== undefined) {
    data.requestedMinutes = normalizeSignedMinutes(payload.requestedMinutes, resolvedEntryType);
  }
  if (payload.approvedMinutes !== undefined) {
    data.approvedMinutes = normalizeSignedMinutes(payload.approvedMinutes, resolvedEntryType);
  }

  if (payload.currency !== undefined) {
    data.currency = String(payload.currency || DEFAULT_CURRENCY).trim().toUpperCase();
  }

  if (payload.periodStart !== undefined) {
    data.periodStart = payload.periodStart ? new Date(payload.periodStart) : null;
  }
  if (payload.periodEnd !== undefined) {
    data.periodEnd = payload.periodEnd ? new Date(payload.periodEnd) : null;
  }

  if (payload.clientApprovalRequired !== undefined || payload.clientApproval !== undefined) {
    data.clientApproval = {
      required: Boolean(
        payload.clientApprovalRequired ?? payload.clientApproval?.required
      ),
    };
  }

  if (payload.adminApprovalRequired !== undefined || payload.adminApproval !== undefined) {
    data.adminApproval = {
      required: payload.adminApprovalRequired ?? payload.adminApproval?.required ?? true,
    };
  }

  if (payload.notes !== undefined) data.notes = payload.notes || null;

  const approvalStatus = normalizeApprovalStatusInput(
    payload.approvalStatus || payload.status,
    { defaultStatus: forUpdate ? null : 'pending' },
  );
  if (approvalStatus) {
    data.approvalStatus = approvalStatus;
  }

  if (approvalStatus && !affectsApprovedCapacity(approvalStatus)) {
    data.approvedMinutes = 0;
    data.approvedAmount = 0;
  }

  if (!forUpdate) {
    data.projectId = project._id;
    data.requestedBy = accountId;
    data.createdBy = accountId;
    if (affectsApprovedCapacity(data.approvalStatus || 'pending')) {
      data.approvedMinutes = normalizeSignedMinutes(
        data.approvedMinutes ?? data.requestedMinutes ?? 0,
        resolvedEntryType,
      );
      data.approvedAmount = normalizeSignedAmount(
        data.approvedAmount ?? data.requestedAmount ?? 0,
        resolvedEntryType,
      );
      data.approvedBy = accountId;
      data.adminApproval = {
        ...(data.adminApproval || {}),
        approvedBy: accountId,
        approvedAt: new Date(),
      };
    }
  }

  data.updatedBy = accountId;
  return syncBudgetCanonicalFields(data);
}

async function listBudgets(projectId) {
  const project = await projectService.getProjectOrThrow(projectId);
  await retainerRenewalService.ensureRetainerBudgetOnAccess(projectId);
  const budgets = await projectBudgetRepository.listByProjectId(projectId);
  const referenceDate = new Date();
  return budgets.map((budget) => toProjectBudgetDto(budget, { project, referenceDate }));
}

async function createBudget(projectId, payload, accountId, req = null) {
  const project = await projectService.getProjectOrThrow(projectId);
  const data = buildBudgetPayload(payload, project, accountId);

  if (!data.title) {
    throw new AppError('Budget title is required', { status: 400, code: projectErrorCodes.PROJECT_BUDGET_INVALID_STATUS });
  }
  if (!data.entryType) {
    data.entryType = normalizeEntryTypeInput(payload.entryType || payload.sourceType) || 'adjustment';
  }
  if (!data.budgetType) {
    data.budgetType = payload.budgetType || 'hours';
    const typeCheck = validateBudgetTypeForProject(project.type, data.budgetType);
    if (!typeCheck.valid) {
      throw new AppError(typeCheck.reason, {
        status: 400,
        code: projectErrorCodes.PROJECT_TYPE_REQUIREMENTS_FAILED,
      });
    }
  }

  if (
    isAdjustmentEntryType(data.entryType)
    && affectsApprovedCapacity(data.approvalStatus)
    && Number(data.approvedMinutes || data.requestedMinutes || 0) === 0
  ) {
    throw new AppError('Adjustment entries must include non-zero minutes or amount', {
      status: 400,
      code: projectErrorCodes.PROJECT_BUDGET_INVALID_STATUS,
    });
  }

  const budget = await projectBudgetRepository.createBudget(syncBudgetCanonicalFields(data));
  await projectStatsService.recalculateStats(projectId);

  await projectEventService.recordEvent({
    projectId,
    eventType: 'PROJECT_BUDGET_CREATED',
    title: budget.title,
    performedBy: accountId,
    metadata: {
      budgetId: String(budget._id),
      entryType: budget.entryType,
      approvalStatus: budget.approvalStatus,
      lifecycleStatus: resolveBudgetLifecycleStatus(budget),
    },
    req,
  });

  return buildMutationResponse(projectId, budget);
}

async function updateBudget(projectId, budgetId, payload, accountId) {
  const project = await projectService.getProjectOrThrow(projectId);
  const existingBudget = await getBudgetOrThrow(projectId, budgetId);

  assertBudgetEditable(existingBudget, payload);

  const updates = buildBudgetPayload(payload, project, accountId, {
    forUpdate: true,
    existingBudget,
  });
  const budget = await projectBudgetRepository.updateBudget(
    budgetId,
    projectId,
    syncBudgetCanonicalFields(updates),
  );
  await projectStatsService.recalculateStats(projectId);
  return buildMutationResponse(projectId, budget);
}

async function updateBudgetStatus(projectId, budgetId, payload, accountId, req = null) {
  const project = await projectService.getProjectOrThrow(projectId);
  const budget = await getBudgetOrThrow(projectId, budgetId);

  const approvalStatus = normalizeApprovalStatusInput(
    payload.approvalStatus || payload.status,
    { defaultStatus: null },
  );
  assertValidApprovalStatus(approvalStatus);

  if (approvalStatus === 'cancelled') {
    const [allBudgets, stats] = await Promise.all([
      projectBudgetRepository.listByProjectId(projectId),
      projectStatsService.getStats(projectId),
    ]);
    assertBudgetCancellable(budget, allBudgets, stats);
  }

  const entryType = normalizeEntryTypeInput(budget.entryType || budget.sourceType);
  const updates = syncBudgetCanonicalFields({
    approvalStatus,
    updatedBy: accountId,
  });

  if (approvalStatus === 'approved') {
    updates.approvedAmount = normalizeSignedAmount(
      payload.approvedAmount ?? budget.approvedAmount ?? budget.requestedAmount ?? 0,
      entryType,
    );
    updates.approvedMinutes = normalizeSignedMinutes(
      payload.approvedMinutes ?? budget.approvedMinutes ?? budget.requestedMinutes ?? 0,
      entryType,
    );
    updates.approvedBy = accountId;
    updates.adminApproval = {
      ...budget.adminApproval?.toObject?.() || budget.adminApproval || {},
      required: budget.adminApproval?.required !== false,
      approvedBy: accountId,
      approvedAt: new Date(),
      notes: payload.notes || budget.adminApproval?.notes || null,
    };
  }

  if (approvalStatus === 'rejected' || approvalStatus === 'cancelled') {
    updates.approvedMinutes = 0;
    updates.approvedAmount = 0;
    updates.approvedBy = null;
    updates.adminApproval = {
      ...budget.adminApproval?.toObject?.() || budget.adminApproval || {},
      notes: payload.notes || budget.adminApproval?.notes || null,
    };
  }

  const updated = await projectBudgetRepository.updateBudget(budgetId, projectId, updates);
  await projectStatsService.recalculateStats(projectId);

  const eventType = approvalStatus === 'approved'
    ? 'PROJECT_BUDGET_APPROVED'
    : approvalStatus === 'rejected'
      ? 'PROJECT_BUDGET_REJECTED'
      : null;

  if (eventType) {
    await projectEventService.recordEvent({
      projectId,
      eventType,
      title: updated.title,
      performedBy: accountId,
      metadata: {
        budgetId: String(updated._id),
        approvalStatus,
      },
      req,
    });
  }

  return buildMutationResponse(projectId, updated);
}

async function deleteBudget(projectId, budgetId, accountId) {
  await projectService.getProjectOrThrow(projectId);
  const budget = await getBudgetOrThrow(projectId, budgetId);
  const [allBudgets, stats] = await Promise.all([
    projectBudgetRepository.listByProjectId(projectId),
    projectStatsService.getStats(projectId),
  ]);

  assertBudgetCancellable(budget, allBudgets, stats);

  await projectBudgetRepository.softDeleteBudget(budgetId, projectId, accountId);
  await projectStatsService.recalculateStats(projectId);
  return buildMutationResponse(projectId);
}

module.exports = {
  listBudgets,
  createBudget,
  updateBudget,
  updateBudgetStatus,
  deleteBudget,
};
