function mapClientStatus({ isActive = true, isDeleted = false } = {}) {
  if (isDeleted) return 'archived';
  if (!isActive) return 'inactive';
  return 'active';
}

function mapClientType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'individual') return 'individual';
  if (normalized === 'internal') return 'internal';
  return 'business';
}

function mapProjectStatus({ status, isActive = true, isDeleted = false } = {}) {
  if (isDeleted) return 'archived';
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'active' || normalized === 'in_progress') return 'active';
  if (normalized === 'completed' || normalized === 'done') return 'completed';
  if (normalized === 'on_hold' || normalized === 'hold') return 'on_hold';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'archived') return 'archived';
  if (!isActive) return 'on_hold';
  return 'draft';
}

function mapProjectType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['fixed_hours', 'fixed_budget', 'retainer', 'hybrid', 'internal'].includes(normalized)) {
    return normalized;
  }
  return 'fixed_hours';
}

function mapBudgetType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'fixed' || normalized === 'hours') return 'hours';
  if (normalized === 'money') return 'money';
  return 'hours';
}

function mapBudgetStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'approved' || normalized === 'active') return 'approved';
  if (normalized === 'pending') return 'pending_admin_approval';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'consumed') return 'consumed';
  return 'approved';
}

function mapBudgetSourceType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'retainer') return 'retainer_month';
  if (normalized === 'change_request') return 'scope_change';
  if (normalized === 'extra_hours') return 'extra_hours';
  return 'initial';
}

function mapAssignmentRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'owner') return 'owner';
  if (normalized === 'lead' || normalized === 'manager') return 'lead';
  if (normalized === 'viewer') return 'viewer';
  return 'member';
}

function mapAssignmentStatus({ status, isDeleted = false } = {}) {
  if (isDeleted) return 'removed';
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'unassigned' || normalized === 'inactive') return 'inactive';
  if (normalized === 'removed') return 'removed';
  return 'active';
}

function mapCapPeriod(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['project', 'day', 'week', 'month'].includes(normalized)) return normalized;
  return 'project';
}

function mapEntrySource(entryType) {
  const normalized = String(entryType || '').trim().toLowerCase();
  if (normalized === 'clock') return 'timer';
  return 'manual';
}

function mapTaskPriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['none', 'low', 'medium', 'high', 'urgent'].includes(normalized)) return normalized;
  return 'none';
}

function mapTaskStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'done') return 'completed';
  if (normalized === 'archived') return 'archived';
  return 'active';
}

module.exports = {
  mapClientStatus,
  mapClientType,
  mapProjectStatus,
  mapProjectType,
  mapBudgetType,
  mapBudgetStatus,
  mapBudgetSourceType,
  mapAssignmentRole,
  mapAssignmentStatus,
  mapCapPeriod,
  mapEntrySource,
  mapTaskPriority,
  mapTaskStatus,
};
