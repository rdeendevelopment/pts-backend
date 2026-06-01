const {
  resolveEntryType,
  resolveApprovalStatus,
  affectsApprovedCapacity,
} = require('../helpers/budgetCapacity.helper');
const { resolveBudgetLifecycleStatus } = require('../helpers/budget.lifecycle.helper');
const { enrichRetainerBudgetDto } = require('../helpers/retainerPeriod.helper');

function toProjectDto(project) {
  if (!project) return null;

  const doc = project.toObject ? project.toObject() : project;

  return {
    id: String(doc._id),
    clientId: doc.clientId ? String(doc.clientId) : null,
    name: doc.name,
    normalizedName: doc.normalizedName,
    code: doc.code,
    description: doc.description,
    type: doc.type,
    status: doc.status,
    priority: doc.priority,
    startDate: doc.startDate,
    dueDate: doc.dueDate,
    completedAt: doc.completedAt,
    billingType: doc.billingType,
    currency: doc.currency,
    allowBudgetExceed: doc.allowBudgetExceed,
    retainerHoursPerMonth: doc.retainerHoursPerMonth ?? null,
    retainerRenewalDay: doc.retainerRenewalDay ?? 1,
    autoCreateMonthlyBudget: doc.autoCreateMonthlyBudget !== false,
    settings: doc.settings || {},
    tags: doc.tags || [],
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
    schemaVersion: doc.schemaVersion,
    isDeleted: doc.isDeleted,
    deletedAt: doc.deletedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toProjectClientSummaryDto(client) {
  if (!client) return null;

  const doc = client.toObject ? client.toObject() : client;
  const contactName = String(doc.primaryContact?.name || '').trim();
  const nameParts = contactName ? contactName.split(/\s+/) : [];

  return {
    id: String(doc._id),
    name: doc.name || '',
    status: doc.status || null,
    type: doc.type || null,
    first_name: nameParts[0] || doc.name || '',
    last_name: nameParts.slice(1).join(' ') || '',
  };
}

function toProjectListItemDto(project, stats = null, client = null) {
  const base = toProjectDto(project);
  const item = stats
    ? { ...base, stats: toProjectStatsDto(stats) }
    : base;

  if (client) {
    item.client = toProjectClientSummaryDto(client);
  }

  return item;
}

function toProjectBudgetDto(budget, { project = null, referenceDate = new Date() } = {}) {
  if (!budget) return null;
  const doc = budget.toObject ? budget.toObject() : budget;

  const entryType = resolveEntryType(doc);
  const approvalStatus = resolveApprovalStatus(doc);
  const lifecycleStatus = resolveBudgetLifecycleStatus(doc);
  const consumedMinutes = Number(doc.consumedMinutes || 0);
  const approvedMinutes = Number(doc.approvedMinutes || 0);
  const enrichment = enrichRetainerBudgetDto(doc, project, referenceDate);
  const affectsCapacityBase = affectsApprovedCapacity(approvalStatus) || lifecycleStatus === 'consumed';
  const affectsCapacity = project?.type === 'retainer' && enrichment.isCurrentPeriod !== null
    ? affectsCapacityBase && enrichment.isCurrentPeriod
    : affectsCapacityBase;

  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    title: doc.title,
    description: doc.description,
    entryType,
    approvalStatus,
    lifecycleStatus,
    sourceType: doc.sourceType,
    budgetType: doc.budgetType,
    status: doc.status,
    requestedAmount: doc.requestedAmount,
    approvedAmount: doc.approvedAmount,
    consumedAmount: doc.consumedAmount,
    requestedMinutes: doc.requestedMinutes,
    approvedMinutes: doc.approvedMinutes,
    consumedMinutes,
    currency: doc.currency,
    periodStart: doc.periodStart,
    periodEnd: doc.periodEnd,
    periodLabel: enrichment.periodLabel,
    isCurrentPeriod: enrichment.isCurrentPeriod,
    clientApproval: doc.clientApproval || {},
    adminApproval: doc.adminApproval || {},
    requestedBy: doc.requestedBy ? String(doc.requestedBy) : null,
    reviewedBy: doc.reviewedBy ? String(doc.reviewedBy) : null,
    approvedBy: doc.approvedBy ? String(doc.approvedBy) : null,
    effectiveFrom: doc.effectiveFrom,
    effectiveTo: doc.effectiveTo,
    notes: doc.notes,
    affectsCapacity,
    canEdit: ['draft', 'pending_client_approval', 'pending_admin_approval', 'pending'].includes(lifecycleStatus)
      || lifecycleStatus === 'approved',
    canEditAmounts: ['draft', 'pending_client_approval', 'pending_admin_approval', 'pending'].includes(lifecycleStatus),
    canCancel: ['draft', 'pending_client_approval', 'pending_admin_approval', 'pending'].includes(lifecycleStatus)
      || (lifecycleStatus === 'approved' && consumedMinutes === 0),
    canAdjust: lifecycleStatus === 'approved' && consumedMinutes > 0,
    isReadOnly: ['rejected', 'cancelled', 'consumed'].includes(lifecycleStatus),
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toProjectAssignmentDto(assignment) {
  if (!assignment) return null;
  const doc = assignment.toObject ? assignment.toObject() : assignment;

  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    userId: String(doc.userId),
    role: doc.role,
    status: doc.status,
    allocation: doc.allocation || {},
    stats: doc.stats || {},
    assignedBy: doc.assignedBy ? String(doc.assignedBy) : null,
    assignedAt: doc.assignedAt,
    removedBy: doc.removedBy ? String(doc.removedBy) : null,
    removedAt: doc.removedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toProjectFileDto(file) {
  if (!file) return null;
  const doc = file.toObject ? file.toObject() : file;

  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    fileName: doc.fileName,
    fileUrl: doc.fileUrl,
    fileType: doc.fileType,
    fileSize: doc.fileSize,
    uploadedBy: doc.uploadedBy ? String(doc.uploadedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toProjectStatsDto(stats) {
  if (!stats) return null;
  const doc = stats.toObject ? stats.toObject() : stats;

  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    totalApprovedMinutes: doc.totalApprovedMinutes,
    totalApprovedAmount: doc.totalApprovedAmount,
    totalPendingMinutes: doc.totalPendingMinutes,
    totalPendingAmount: doc.totalPendingAmount,
    totalAssignedMinutes: doc.totalAssignedMinutes,
    totalConsumedMinutes: doc.totalConsumedMinutes,
    totalRemainingMinutes: doc.totalRemainingMinutes,
    totalAvailableToAssignMinutes: doc.totalAvailableToAssignMinutes,
    totalMembers: doc.totalMembers,
    totalBudgets: doc.totalBudgets,
    totalFiles: doc.totalFiles,
    lastActivityAt: doc.lastActivityAt,
    recalculatedAt: doc.recalculatedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toProjectEventDto(event) {
  if (!event) return null;
  const doc = event.toObject ? event.toObject() : event;

  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    eventType: doc.eventType,
    title: doc.title,
    description: doc.description,
    performedBy: doc.performedBy ? String(doc.performedBy) : null,
    metadata: doc.metadata || {},
    ipAddress: doc.ipAddress,
    userAgent: doc.userAgent,
    createdAt: doc.createdAt,
  };
}

module.exports = {
  toProjectDto,
  toProjectClientSummaryDto,
  toProjectListItemDto,
  toProjectBudgetDto,
  toProjectAssignmentDto,
  toProjectFileDto,
  toProjectStatsDto,
  toProjectEventDto,
};
