const { AppError } = require('../../../kernel/errors');
const { syncBudgetCanonicalFields } = require('../helpers/budgetCapacity.helper');
const { resolveInitialBudgetStatus } = require('../helpers/budget.helper');
const {
  clampRenewalDay,
  getRetainerPeriodBounds,
  getNextRetainerPeriod,
  formatRetainerPeriodLabel,
} = require('../helpers/retainerPeriod.helper');
const projectErrorCodes = require('../errors/projectErrorCodes');
const projectRepository = require('../repositories/project.repository');
const projectBudgetRepository = require('../repositories/projectBudget.repository');
const projectStatsService = require('./projectStats.service');
const projectEventService = require('./projectEvent.service');
const projectService = require('./projectAccess.service');

function resolveRetainerConfig(project) {
  const hours = Number(project.retainerHoursPerMonth || 0);
  return {
    hoursPerMonth: hours,
    renewalDay: clampRenewalDay(project.retainerRenewalDay),
    autoCreate: project.autoCreateMonthlyBudget !== false,
  };
}

function assertRetainerProject(project) {
  if (!project || project.type !== 'retainer') {
    throw new AppError('Project is not a retainer project', {
      status: 400,
      code: projectErrorCodes.PROJECT_TYPE_REQUIREMENTS_FAILED,
    });
  }
}

function buildRetainerCyclePayload(project, period, accountId, { approvalStatus = 'approved' } = {}) {
  const config = resolveRetainerConfig(project);
  const minutes = Math.round(config.hoursPerMonth * 60);
  const periodLabel = formatRetainerPeriodLabel(period.periodStart, period.periodEnd);
  const status = approvalStatus === 'approved' ? 'approved' : resolveInitialBudgetStatus(project, { approvalStatus });

  return syncBudgetCanonicalFields({
    projectId: project._id,
    title: periodLabel ? `${periodLabel} retainer` : 'Retainer cycle',
    description: null,
    entryType: 'retainer_cycle',
    sourceType: 'retainer_month',
    budgetType: 'hours',
    approvalStatus: status === 'approved' ? 'approved' : 'pending',
    status,
    requestedMinutes: minutes,
    approvedMinutes: status === 'approved' ? minutes : 0,
    requestedAmount: 0,
    approvedAmount: 0,
    currency: project.currency || 'USD',
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    adminApproval: {
      required: false,
      approvedBy: status === 'approved' ? accountId : null,
      approvedAt: status === 'approved' ? new Date() : null,
    },
    requestedBy: accountId,
    approvedBy: status === 'approved' ? accountId : null,
    createdBy: accountId,
    updatedBy: accountId,
    notes: null,
  });
}

async function createRetainerCycleBudget(project, period, accountId, options = {}) {
  const existing = await projectBudgetRepository.findRetainerCycleByPeriodStart(
    project._id,
    period.periodStart,
  );
  if (existing) {
    return { budget: existing, created: false };
  }

  const payload = buildRetainerCyclePayload(project, period, accountId, options);
  const budget = await projectBudgetRepository.createBudget(payload);
  return { budget, created: true };
}

async function ensureRetainerPeriodBudget(project, period, accountId, req = null) {
  const config = resolveRetainerConfig(project);
  if (config.hoursPerMonth < 1) {
    return { budget: null, created: false, skipped: true, reason: 'no_hours_configured' };
  }

  const { budget, created } = await createRetainerCycleBudget(project, period, accountId);
  if (!created) {
    return { budget, created: false };
  }

  await projectStatsService.recalculateStats(project._id);

  await projectEventService.recordEvent({
    projectId: project._id,
    eventType: 'PROJECT_BUDGET_CREATED',
    title: budget.title,
    performedBy: accountId,
    metadata: {
      budgetId: String(budget._id),
      entryType: budget.entryType,
      approvalStatus: budget.approvalStatus,
      periodStart: budget.periodStart,
      periodEnd: budget.periodEnd,
      autoRenewal: !req,
    },
    req,
  });

  return { budget, created: true };
}

async function ensureCurrentRetainerBudget(projectId, accountId, req = null) {
  const project = await projectService.getProjectOrThrow(projectId);
  assertRetainerProject(project);
  const config = resolveRetainerConfig(project);
  const period = getRetainerPeriodBounds(new Date(), config.renewalDay);
  return ensureRetainerPeriodBudget(project, period, accountId, req);
}

async function ensureNextRetainerBudget(projectId, accountId, req = null) {
  const project = await projectService.getProjectOrThrow(projectId);
  assertRetainerProject(project);
  const config = resolveRetainerConfig(project);
  const current = getRetainerPeriodBounds(new Date(), config.renewalDay);
  const next = getNextRetainerPeriod(current.periodStart, config.renewalDay);
  return ensureRetainerPeriodBudget(project, next, accountId, req);
}

async function processRetainerRenewalForProject(project, referenceDate = new Date(), accountId = null) {
  if (!project || project.isDeleted || project.type !== 'retainer') {
    return { created: false, skipped: true, reason: 'not_retainer' };
  }

  if (project.status !== 'active') {
    return { created: false, skipped: true, reason: 'project_not_active' };
  }

  const config = resolveRetainerConfig(project);
  if (!config.autoCreate || config.hoursPerMonth < 1) {
    return { created: false, skipped: true, reason: 'auto_create_disabled' };
  }

  const period = getRetainerPeriodBounds(referenceDate, config.renewalDay);
  const result = await ensureRetainerPeriodBudget(project, period, accountId);
  return {
    projectId: String(project._id),
    created: result.created,
    skipped: result.skipped,
    reason: result.reason,
    budgetId: result.budget ? String(result.budget._id) : null,
  };
}

async function runRetainerAutoRenewalJob(referenceDate = new Date()) {
  const projects = await projectRepository.listRetainerProjectsForAutoRenewal();
  const results = {
    checked: projects.length,
    created: 0,
    skipped: 0,
    errors: [],
  };

  for (const project of projects) {
    try {
      const outcome = await processRetainerRenewalForProject(project, referenceDate, null);
      if (outcome.created) results.created += 1;
      else results.skipped += 1;
    } catch (err) {
      results.errors.push({
        projectId: String(project._id),
        message: err.message,
      });
    }
  }

  return results;
}

async function ensureRetainerBudgetOnAccess(projectId) {
  const project = await projectRepository.findById(projectId);
  if (!project || project.type !== 'retainer' || project.status !== 'active') {
    return null;
  }
  return processRetainerRenewalForProject(project, new Date(), null);
}

module.exports = {
  resolveRetainerConfig,
  buildRetainerCyclePayload,
  createRetainerCycleBudget,
  ensureRetainerPeriodBudget,
  ensureCurrentRetainerBudget,
  ensureNextRetainerBudget,
  processRetainerRenewalForProject,
  runRetainerAutoRenewalJob,
  ensureRetainerBudgetOnAccess,
};
