const { WORKFLOW_ORDER_STEP } = require('../constants/tasks.constants');

const DEFAULT_WORKFLOW_STATUSES = [
  { name: 'Backlog', key: 'backlog', order: 0, category: 'not_started', color: '#94A3B8', isTerminal: false },
  { name: 'Todo', key: 'todo', order: WORKFLOW_ORDER_STEP, category: 'not_started', color: '#3B82F6', isTerminal: false },
  { name: 'In Progress', key: 'in_progress', order: WORKFLOW_ORDER_STEP * 2, category: 'active', color: '#F59E0B', isTerminal: false },
  { name: 'Review', key: 'review', order: WORKFLOW_ORDER_STEP * 3, category: 'active', color: '#8B5CF6', isTerminal: false },
  { name: 'QA', key: 'qa', order: WORKFLOW_ORDER_STEP * 4, category: 'active', color: '#EC4899', isTerminal: false },
  { name: 'Done', key: 'done', order: WORKFLOW_ORDER_STEP * 5, category: 'done', color: '#10B981', isTerminal: true },
  { name: 'Archived', key: 'archived', order: WORKFLOW_ORDER_STEP * 6, category: 'cancelled', color: '#64748B', isTerminal: false },
];

module.exports = {
  DEFAULT_WORKFLOW_STATUSES,
};
