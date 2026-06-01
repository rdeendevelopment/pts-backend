const COLLABORATOR_ACCESS_TYPES = ['comment', 'review', 'edit'];

function normalizeAccessType(accessType) {
  if (COLLABORATOR_ACCESS_TYPES.includes(accessType)) return accessType;
  return 'comment';
}

function mapAssignmentRoleToEditorRole(role) {
  if (role === 'lead') return 'admin';
  return role || 'member';
}

function canEditProjectWithRole(role) {
  return ['owner', 'admin', 'member'].includes(role);
}

module.exports = {
  COLLABORATOR_ACCESS_TYPES,
  normalizeAccessType,
  mapAssignmentRoleToEditorRole,
  canEditProjectWithRole,
};
