const TASK_STATUSES = ['active', 'completed', 'archived'];
const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];
const WORKFLOW_STATUSES = ['active', 'inactive'];
const WORKFLOW_STATUS_CATEGORIES = ['not_started', 'active', 'done', 'cancelled'];
const TASK_MEMBER_ROLES = ['owner', 'admin', 'member', 'viewer'];
const TASK_ACTIVITY_EVENT_TYPES = [
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_MOVED',
  'TASK_COMPLETED',
  'TASK_ARCHIVED',
  'TASK_RESTORED',
  'TASK_COMMENT_ADDED',
];

const WORKFLOW_ORDER_STEP = 1024;

module.exports = {
  TASK_STATUSES,
  TASK_PRIORITIES,
  WORKFLOW_STATUSES,
  WORKFLOW_STATUS_CATEGORIES,
  TASK_MEMBER_ROLES,
  TASK_ACTIVITY_EVENT_TYPES,
  WORKFLOW_ORDER_STEP,
};
