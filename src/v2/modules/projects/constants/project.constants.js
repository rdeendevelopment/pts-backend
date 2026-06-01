const PROJECT_STATUSES = ['draft', 'active', 'on_hold', 'completed', 'cancelled', 'archived'];
const PROJECT_TYPES = ['fixed_hours', 'fixed_budget', 'retainer', 'hybrid', 'internal'];
const PROJECT_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const BILLING_TYPES = ['billable', 'non_billable', 'internal'];

const BUDGET_ENTRY_TYPES = [
  'initial',
  'extension',
  'change_request',
  'retainer_cycle',
  'adjustment',
];

const BUDGET_APPROVAL_STATUSES = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'cancelled',
];

// Legacy fields kept for backward compatibility during migration.
const BUDGET_SOURCE_TYPES = [
  'initial',
  'extra_hours',
  'feature_request',
  'scope_change',
  'manual_adjustment',
  'retainer_month',
  'retainer_renewal',
];
const BUDGET_TYPES = ['money', 'hours', 'hybrid'];
const BUDGET_STATUSES = [
  'draft',
  'pending_client_approval',
  'pending_admin_approval',
  'approved',
  'rejected',
  'cancelled',
  'consumed',
];

const ASSIGNMENT_ROLES = ['owner', 'lead', 'member', 'viewer'];
const ASSIGNMENT_STATUSES = ['active', 'inactive', 'removed'];
const CAP_PERIODS = ['project', 'day', 'week', 'month'];

const PROJECT_EVENT_TYPES = [
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_STATUS_CHANGED',
  'PROJECT_DELETED',
  'PROJECT_BUDGET_CREATED',
  'PROJECT_BUDGET_APPROVED',
  'PROJECT_BUDGET_REJECTED',
  'PROJECT_MEMBER_ASSIGNED',
  'PROJECT_MEMBER_UPDATED',
  'PROJECT_MEMBER_REMOVED',
  'PROJECT_FILE_ADDED',
];

const DEFAULT_CURRENCY = 'USD';
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

const APPROVED_BUDGET_STATUSES = ['approved'];
const PENDING_BUDGET_STATUSES = ['draft', 'pending_client_approval', 'pending_admin_approval'];
const INACTIVE_BUDGET_STATUSES = ['rejected', 'cancelled'];

const APPROVED_CAPACITY_STATUSES = ['approved'];
const PENDING_CAPACITY_STATUSES = ['draft', 'pending'];
const INACTIVE_CAPACITY_STATUSES = ['rejected', 'cancelled'];

module.exports = {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  PROJECT_PRIORITIES,
  BILLING_TYPES,
  BUDGET_ENTRY_TYPES,
  BUDGET_APPROVAL_STATUSES,
  BUDGET_SOURCE_TYPES,
  BUDGET_TYPES,
  BUDGET_STATUSES,
  ASSIGNMENT_ROLES,
  ASSIGNMENT_STATUSES,
  CAP_PERIODS,
  PROJECT_EVENT_TYPES,
  DEFAULT_CURRENCY,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  APPROVED_BUDGET_STATUSES,
  PENDING_BUDGET_STATUSES,
  INACTIVE_BUDGET_STATUSES,
  APPROVED_CAPACITY_STATUSES,
  PENDING_CAPACITY_STATUSES,
  INACTIVE_CAPACITY_STATUSES,
};
