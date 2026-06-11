const { GUEST_ROLE_PERMISSIONS } = require('../constants/discussFlow.constants');

const TOPIC_ROLE_PERMISSIONS = {
  viewer: {
    read: true,
    write: false,
    createDraft: false,
    submitReview: false,
    approveLock: false,
    handoff: false,
    bulkApprove: false,
    revokeGuestLink: false,
    archive: false,
    globalSearch: true,
  },
  commenter: {
    read: true,
    write: true,
    createDraft: false,
    submitReview: false,
    approveLock: false,
    handoff: false,
    bulkApprove: false,
    revokeGuestLink: false,
    archive: false,
    globalSearch: true,
  },
  contributor: {
    read: true,
    write: true,
    createDraft: true,
    submitReview: true,
    approveLock: false,
    handoff: false,
    bulkApprove: false,
    revokeGuestLink: false,
    archive: false,
    globalSearch: true,
  },
  manager: {
    read: true,
    write: true,
    createDraft: true,
    submitReview: true,
    approveLock: true,
    handoff: true,
    bulkApprove: true,
    revokeGuestLink: true,
    archive: false,
    globalSearch: true,
  },
  owner: {
    read: true,
    write: true,
    createDraft: true,
    submitReview: true,
    approveLock: true,
    handoff: true,
    bulkApprove: true,
    revokeGuestLink: true,
    archive: true,
    globalSearch: true,
  },
};

function resolveTopicRole(actor, topic, member) {
  if (!actor || actor.actorType === 'guest') return actor?.role || 'viewer';
  if (topic && String(topic.ownerId) === String(actor.actorId)) return 'owner';
  return member?.role || 'viewer';
}

function getTopicRolePermissions(role) {
  return TOPIC_ROLE_PERMISSIONS[role] || TOPIC_ROLE_PERMISSIONS.viewer;
}

function getGuestPermissions(role) {
  return GUEST_ROLE_PERMISSIONS[role] || GUEST_ROLE_PERMISSIONS.viewer;
}

function roleHasPermission(role, permissionKey) {
  const perms = getTopicRolePermissions(role);
  return Boolean(perms[permissionKey]);
}

function buildPermissionMatrix() {
  return {
    topic_roles: TOPIC_ROLE_PERMISSIONS,
    guest_roles: GUEST_ROLE_PERMISSIONS,
  };
}

module.exports = {
  TOPIC_ROLE_PERMISSIONS,
  resolveTopicRole,
  getTopicRolePermissions,
  getGuestPermissions,
  roleHasPermission,
  buildPermissionMatrix,
};
