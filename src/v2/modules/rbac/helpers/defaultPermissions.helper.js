/**
 * System permissions seeded at bootstrap.
 * Format: <module_key>.<action>
 */
const DEFAULT_PERMISSIONS = [
  { key: 'auth.me', name: 'View own session', description: 'Read current account session.', category: 'system' },
  { key: 'modules.view', name: 'View modules', description: 'List and read platform modules.', category: 'view' },
  { key: 'modules.manage', name: 'Manage modules', description: 'Create and update platform modules.', category: 'manage' },
  { key: 'rbac.view', name: 'View RBAC', description: 'Read roles, permissions, and assignments.', category: 'view' },
  { key: 'rbac.manage', name: 'Manage RBAC', description: 'Manage roles and account role assignments.', category: 'manage' },
  { key: 'users.view', name: 'View users', description: 'Read user profiles.', category: 'view' },
  { key: 'users.manage', name: 'Manage users', description: 'Create and update user profiles.', category: 'manage' },
  { key: 'clients.view', name: 'View clients', description: 'Read client records.', category: 'view' },
  { key: 'clients.manage', name: 'Manage clients', description: 'Create and update client records.', category: 'manage' },
  { key: 'projects.view', name: 'View projects', description: 'Read project records.', category: 'view' },
  { key: 'projects.manage', name: 'Manage projects', description: 'Create and update project records.', category: 'manage' },
  { key: 'assignments.view', name: 'View assignments', description: 'Read project assignments.', category: 'view' },
  { key: 'assignments.manage', name: 'Manage assignments', description: 'Create and update assignments.', category: 'manage' },
  { key: 'budgets.view', name: 'View budgets', description: 'Read project budgets.', category: 'view' },
  { key: 'budgets.manage', name: 'Manage budgets', description: 'Create and update budgets.', category: 'manage' },
  { key: 'activity.view', name: 'View activity', description: 'Read activity and time entries.', category: 'view' },
  { key: 'activity.manage', name: 'Manage activity', description: 'Create and update activity entries.', category: 'manage' },
  { key: 'clock_activity.view', name: 'View clock activity', description: 'Access live clock-in / clock-out time tracking.', category: 'view' },
  { key: 'clock_activity.manage', name: 'Manage clock activity', description: 'Manage live clock-in / clock-out time tracking.', category: 'manage' },
  { key: 'tasks.view', name: 'View tasks', description: 'Read tasks.', category: 'view' },
  { key: 'tasks.manage', name: 'Manage tasks', description: 'Create and update tasks.', category: 'manage' },
  { key: 'converse.view', name: 'View converse', description: 'Read conversations.', category: 'view' },
  { key: 'converse.manage', name: 'Manage converse', description: 'Create and update conversations.', category: 'manage' },
  { key: 'reports.view', name: 'View reports', description: 'Read reports and dashboards.', category: 'view' },
  { key: 'reports.manage', name: 'Manage reports', description: 'Configure reports and dashboards.', category: 'manage' },
  { key: 'daily_flow.view', name: 'View daily flow', description: 'Read own daily flow records.', category: 'view' },
  { key: 'daily_flow.manage', name: 'Manage daily flow', description: 'Create and update own daily flow records.', category: 'manage' },
  { key: 'daily_flow.admin', name: 'Admin daily flow', description: 'View work-related daily flow summaries.', category: 'manage' },
  { key: 'discuss_flow.view', name: 'View DiscussFlow', description: 'Read workspaces, topics, and discussion artifacts.', category: 'view' },
  { key: 'discuss_flow.manage', name: 'Manage DiscussFlow', description: 'Create and update DiscussFlow content.', category: 'manage' },
];

module.exports = DEFAULT_PERMISSIONS;
