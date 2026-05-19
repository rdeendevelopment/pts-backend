/**
 * Project Module Serializers
 * Centralized response formatting for all project-related data
 *
 * Consolidates serialization logic previously scattered across
 * services and repositories into a single, testable layer.
 */

function isoDate(date) {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toDateOnly(date) {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Serialize a user object
 */
function serializeUser(user) {
  if (!user) return null;
  return {
    id: Number(user.legacyId),
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    role: user.role,
    is_active: Boolean(user.isActive),
    is_deleted: Boolean(user.isDeleted),
  };
}

/**
 * Serialize a client object
 */
function serializeClient(client) {
  if (!client) return null;
  return {
    id: Number(client.legacyId),
    first_name: client.firstName,
    last_name: client.lastName,
    company_name: client.companyName,
    email: client.email,
    is_active: Boolean(client.isActive),
    created_at: isoDate(client.createdAt),
    updated_at: isoDate(client.updatedAt),
  };
}

/**
 * Serialize a project assignment (user assigned to project)
 * Replaces duplicate implementations in service and repository
 */
function serializeAssignment(assignment) {
  if (!assignment) return null;

  return {
    id: Number(assignment.legacyId),
    project_id: Number(assignment.legacyProjectId),
    user_id: Number(assignment.legacyUserId),
    assign_date: isoDate(assignment.assignDate),
    unassign_date: isoDate(assignment.unassignDate),
    status: assignment.status,
    is_deleted: Boolean(assignment.isDeleted),
    hours_cap_minutes: assignment.hoursCapMinutes,
    cap_period: assignment.capPeriod,
    assigned_role: assignment.assignedRole,
    can_log_time: assignment.canLogTime !== false,
    created_at: isoDate(assignment.createdAt),
    updated_at: isoDate(assignment.updatedAt),
    user: assignment.userId ? serializeUser(assignment.userId) : null,
  };
}

/**
 * Serialize a project object with full details
 * Replaces duplicate implementations in service and repository
 */
function serializeProject(project, extras = {}) {
  if (!project) return null;

  return {
    id: Number(project.legacyId),
    title: project.title,
    client_id: project.legacyClientId ? Number(project.legacyClientId) : null,
    client_name: extras.clientName || (project.clientSnapshot?.companyName || ''),
    client: extras.client || null,
    detail: project.detail || '',
    notes: project.notes || '',
    is_retain: Boolean(project.isRetain),
    project_type: project.projectType,
    retainer_hours_per_month: project.retainerHoursPerMonth,
    retainer_renewal_day: project.retainerRenewalDay,
    auto_create_monthly_budget: Boolean(project.autoCreateMonthlyBudget),
    allow_budget_exceed: Boolean(project.allowBudgetExceed),
    budget_amount: project.budgetAmount,
    estimated_hours: project.estimatedHours,
    extra_hours: project.extraHours,
    deadline: isoDate(project.deadline),
    status: project.status,
    is_active: Boolean(project.isActive),
    is_deleted: Boolean(project.isDeleted),
    created_at: isoDate(project.createdAt || project.legacyCreatedAt),
    updated_at: isoDate(project.updatedAt || project.legacyUpdatedAt),
    assigned_users: (extras.assignedUsers || []).map(serializeAssignment),
    attachments: extras.attachments || [],
    // Budget summaries (if provided)
    total_allocated_minutes: extras.totalAllocatedMinutes || 0,
    total_consumed_minutes: extras.totalConsumedMinutes || 0,
    total_logged_minutes: extras.totalLoggedMinutes || 0,
    total_remaining_minutes: Math.max(0, (extras.totalAllocatedMinutes || 0) - (extras.totalConsumedMinutes || 0)),
  };
}

/**
 * Serialize a budget object
 */
function serializeBudget(budget) {
  if (!budget) return null;

  const allocated = budget.allocatedMinutes === null || budget.allocatedMinutes === undefined ? null : Number(budget.allocatedMinutes);
  const consumed = Number(budget.consumedMinutes || 0);
  const remaining = allocated === null ? null : allocated - consumed;
  const usagePercent = allocated ? Math.round((consumed / allocated) * 100) : null;
  const warningThreshold = Number(budget.warningThresholdPercent || 80);

  return {
    id: Number(budget.legacyId),
    project_id: budget.projectId?.legacyId ?? null,
    name: budget.name,
    description: budget.description,
    budget_type: budget.budgetType,
    billing_type: budget.billingType,
    allocated_minutes: allocated,
    consumed_minutes: consumed,
    start_date: toDateOnly(budget.startDate),
    end_date: toDateOnly(budget.endDate),
    allow_exceed: Boolean(budget.allowExceed),
    warning_threshold_percent: warningThreshold,
    status: budget.status,
    created_at: isoDate(budget.createdAt),
    updated_at: isoDate(budget.updatedAt),
    remaining_minutes: remaining,
    usage_percent: usagePercent,
    is_warning: usagePercent !== null && usagePercent >= warningThreshold && consumed < allocated,
    allocated_label: allocated === null ? 'Flexible' : formatMinutes(allocated),
    consumed_label: formatMinutes(consumed),
    remaining_label: remaining === null ? 'Flexible' : formatMinutes(Math.max(0, remaining)),
  };
}

/**
 * Serialize a project request (change request)
 */
function serializeProjectRequest(request) {
  if (!request) return null;

  return {
    id: Number(request.legacyId),
    project_id: Number(request.legacyProjectId),
    user_id: Number(request.legacyUserId),
    type: request.type,
    detail: request.detail,
    hours: request.hours,
    status: request.status,
    created_at: isoDate(request.createdAt),
    updated_at: isoDate(request.updatedAt),
  };
}

/**
 * Format minutes to human-readable time (e.g., "2h 30m")
 */
function formatMinutes(minutes) {
  const m = Math.max(0, Number(minutes || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/**
 * Serialize budget summary (aggregated view)
 */
function serializeBudgetSummary(data) {
  return {
    total_allocated_minutes: data.totalAllocatedMinutes || 0,
    total_consumed_minutes: data.totalConsumedMinutes || 0,
    total_remaining_minutes: Math.max(0, (data.totalAllocatedMinutes || 0) - (data.totalConsumedMinutes || 0)),
    active_budget_count: data.activeBudgetCount || 0,
    exceeded_budget_count: data.exceededBudgetCount || 0,
    budget_warning_count: data.budgetWarningCount || 0,
    total_allocated_label: formatMinutes(data.totalAllocatedMinutes || 0),
    total_consumed_label: formatMinutes(data.totalConsumedMinutes || 0),
    total_remaining_label: formatMinutes(Math.max(0, (data.totalAllocatedMinutes || 0) - (data.totalConsumedMinutes || 0))),
  };
}

module.exports = {
  serializeUser,
  serializeClient,
  serializeAssignment,
  serializeProject,
  serializeBudget,
  serializeProjectRequest,
  serializeBudgetSummary,
  formatMinutes,
  isoDate,
  toDateOnly,
};
