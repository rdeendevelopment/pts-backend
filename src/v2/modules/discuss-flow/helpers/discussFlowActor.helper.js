const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const { GUEST_ROLE_PERMISSIONS } = require('../constants/discussFlow.constants');
const topicMemberRepository = require('../repositories/discussFlowTopicMember.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');

function resolveGuestPermissions(role, overrides = {}) {
  const base = { ...(GUEST_ROLE_PERMISSIONS[role] || GUEST_ROLE_PERMISSIONS.viewer) };
  return { ...base, ...overrides };
}

function buildGuestActor(session) {
  return {
    actorType: 'guest',
    actorId: session.sessionId,
    tenantId: String(session.tenantId),
    workspaceId: String(session.workspaceId),
    topicId: String(session.topicId),
    role: session.role,
    permissions: session.permissions || resolveGuestPermissions(session.role),
    displayName: session.name || null,
    email: session.email || null,
    guestLinkId: session.guestLinkId ? String(session.guestLinkId) : null,
  };
}

async function buildUserActor(accountId, tenantId, topicId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedTopicId = assertObjectId(topicId, 'topicId');

  const topic = await topicRepository.findById(normalizedTopicId, normalizedTenantId);
  if (!topic) {
    throw new AppError('Topic not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_TOPIC_NOT_FOUND,
    });
  }

  const member = await topicMemberRepository.findByTopicAndAccount(topic._id, normalizedAccountId);
  const role = String(topic.ownerId) === String(normalizedAccountId)
    ? 'owner'
    : (member?.role || null);

  return {
    actorType: 'user',
    actorId: String(normalizedAccountId),
    tenantId: String(normalizedTenantId),
    workspaceId: String(topic.workspaceId),
    topicId: String(topic._id),
    role,
    permissions: member?.permissions || {},
    accountId: String(normalizedAccountId),
    topic,
    member,
  };
}

function assertActorTopicScope(actor, topicId) {
  if (!actor || String(actor.topicId) !== String(topicId)) {
    throw new AppError('Topic access denied', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }
}

module.exports = {
  resolveGuestPermissions,
  buildGuestActor,
  buildUserActor,
  assertActorTopicScope,
};
