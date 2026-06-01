const {
  resolveInitialBudgetApprovalStatus,
  syncBudgetCanonicalFields,
  affectsApprovedCapacity,
} = require('./budgetCapacity.helper');
const { mapBudgetTotals, validateBudgetTypeForProject } = require('./budget.helper');
const projectBudgetRepository = require('../repositories/projectBudget.repository');
const projectAssignmentRepository = require('../repositories/projectAssignment.repository');
const projectEventService = require('../services/projectEvent.service');
const { resolveBudgetLifecycleStatus } = require('./budget.lifecycle.helper');

const PROJECT_TYPES_WITH_HOUR_CAPACITY = ['fixed_hours', 'hybrid'];

async function sumActiveAssignmentMinutes(
  projectId,
  assignmentRepo = projectAssignmentRepository,
) {
  const assignments = await assignmentRepo.listByProjectId(projectId, {
    status: 'active',
  });

  return assignments.reduce(
    (sum, row) => sum + Math.max(0, Number(row.allocation?.allocatedMinutes || 0)),
    0,
  );
}

/**
 * When team members are allocated hours but the project has no approved capacity
 * budget, time entry is blocked. Sync an approved hours budget to cover allocations.
 */
async function ensureApprovedCapacityCoversAssignments(
  project,
  accountId,
  req = null,
  deps = {},
) {
  const budgetRepo = deps.projectBudgetRepository || projectBudgetRepository;
  const assignmentRepo = deps.projectAssignmentRepository || projectAssignmentRepository;
  const eventService = deps.projectEventService || projectEventService;

  if (!project || !PROJECT_TYPES_WITH_HOUR_CAPACITY.includes(project.type)) {
    return null;
  }

  const requiredMinutes = deps.requiredMinutes != null
    ? deps.requiredMinutes
    : await sumActiveAssignmentMinutes(project._id, assignmentRepo);
  if (requiredMinutes <= 0) {
    return null;
  }

  const budgets = await budgetRepo.listByProjectId(project._id);
  const { totalApprovedMinutes } = mapBudgetTotals(budgets);
  const deficit = requiredMinutes - totalApprovedMinutes;

  if (deficit <= 0) {
    return null;
  }

  const budgetType = 'hours';
  const typeCheck = validateBudgetTypeForProject(project.type, budgetType);
  if (!typeCheck.valid) {
    return null;
  }

  const entryType = totalApprovedMinutes === 0 ? 'initial' : 'extension';
  const approvalStatus = resolveInitialBudgetApprovalStatus(project, {
    approvalStatus: 'approved',
  });

  const payload = syncBudgetCanonicalFields({
    projectId: project._id,
    title: entryType === 'initial' ? 'Project capacity' : 'Capacity extension',
    description: 'Auto-created from team hour allocations.',
    entryType,
    budgetType,
    approvalStatus,
    requestedMinutes: deficit,
    approvedMinutes: affectsApprovedCapacity(approvalStatus) ? deficit : 0,
    createdBy: accountId,
    updatedBy: accountId,
    requestedBy: accountId,
    approvedBy: affectsApprovedCapacity(approvalStatus) ? accountId : null,
    adminApproval: affectsApprovedCapacity(approvalStatus)
      ? { required: true, approvedBy: accountId, approvedAt: new Date() }
      : { required: true },
  });

  const budget = await budgetRepo.createBudget(payload);

  await eventService.recordEvent({
    projectId: project._id,
    eventType: 'PROJECT_BUDGET_CREATED',
    title: budget.title,
    performedBy: accountId,
    metadata: {
      budgetId: String(budget._id),
      entryType: budget.entryType,
      approvalStatus: budget.approvalStatus,
      lifecycleStatus: resolveBudgetLifecycleStatus(budget),
      source: 'assignment_capacity_sync',
    },
    req,
  });

  return budget;
}

module.exports = {
  PROJECT_TYPES_WITH_HOUR_CAPACITY,
  sumActiveAssignmentMinutes,
  ensureApprovedCapacityCoversAssignments,
};
