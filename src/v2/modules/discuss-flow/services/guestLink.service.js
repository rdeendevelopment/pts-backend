const bcrypt = require('bcryptjs');
const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const authConfig = require('../../auth/constants/auth.constants');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const guestLinkRepository = require('../repositories/discussFlowGuestLink.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const workspaceRepository = require('../repositories/discussFlowWorkspace.repository');
const timelineService = require('./timeline.service');
const guestTokenService = require('./guestToken.service');
const { toGuestLinkDto } = require('../dto/discussFlow.dto');
const { pickString, pickField, pickBoolean } = require('../helpers/payload.helper');
const { assertTopicManage, assertValidGuestRole } = require('../helpers/discussFlowPermission.helper');
const { resolveGuestPermissions } = require('../helpers/discussFlowActor.helper');
const topicService = require('./topic.service');

function isLinkExpired(link) {
  return Boolean(link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now());
}

function isLinkExhausted(link) {
  return link.maxUses != null && link.usedCount >= link.maxUses;
}

function resolveLinkStatus(link) {
  if (link.status === 'revoked') return 'revoked';
  if (isLinkExpired(link)) return 'expired';
  if (isLinkExhausted(link)) return 'expired';
  return link.status;
}

async function loadLinkByToken(rawToken) {
  const tokenHash = guestTokenService.hashGuestLinkToken(rawToken);
  const link = await guestLinkRepository.findByTokenHash(tokenHash);
  if (!link) {
    throw new AppError('Guest link not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_GUEST_LINK_NOT_FOUND,
    });
  }
  return link;
}

function assertLinkUsable(link) {
  const status = resolveLinkStatus(link);
  if (status === 'revoked') {
    throw new AppError('Guest link revoked', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_GUEST_LINK_REVOKED,
    });
  }
  if (status === 'expired') {
    throw new AppError('Guest link expired', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_GUEST_LINK_EXPIRED,
    });
  }
}

async function createGuestLink(tenantId, accountId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const topicId = assertObjectId(payload.topic_id || payload.topicId, 'topicId');

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  assertTopicManage(normalizedAccountId, topic, member);

  const role = pickString(payload, 'role') || 'viewer';
  assertValidGuestRole(role);

  const password = pickString(payload, 'password');
  const passwordEnabled = pickBoolean(payload, 'password_enabled', 'passwordEnabled') || Boolean(password);
  let passwordHash = null;
  if (passwordEnabled) {
    if (!password) {
      throw new AppError('Password is required when password protection is enabled', {
        status: 400,
        code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
        fields: { password: 'password is required' },
      });
    }
    passwordHash = await bcrypt.hash(password, authConfig.bcryptRounds);
  }

  const rawToken = guestTokenService.generateGuestLinkToken();
  const tokenHash = guestTokenService.hashGuestLinkToken(rawToken);
  const permissions = resolveGuestPermissions(role, payload.permissions || {});

  const row = await guestLinkRepository.create({
    tenantId: normalizedTenantId,
    workspaceId: topic.workspaceId,
    topicId: topic._id,
    createdBy: normalizedAccountId,
    role,
    permissions,
    tokenHash,
    label: pickString(payload, 'label'),
    status: 'active',
    expiresAt: payload.expires_at || payload.expiresAt || null,
    maxUses: pickField(payload, 'max_uses', 'maxUses'),
    usedCount: 0,
    allowAnonymousName: pickBoolean(payload, 'allow_anonymous_name', 'allowAnonymousName') !== false,
    requireName: Boolean(pickBoolean(payload, 'require_name', 'requireName')),
    requireEmail: Boolean(pickBoolean(payload, 'require_email', 'requireEmail')),
    passwordHash,
    passwordEnabled,
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'guest_link_created',
    actorId: normalizedAccountId,
    payload: { guest_link_id: String(row._id), role, label: row.label || null },
  });

  const dto = toGuestLinkDto(row);
  return {
    ...dto,
    token: rawToken,
    share_url_path: `/api/v2/discuss-flow/guest/${rawToken}/preview`,
  };
}

async function revokeGuestLink(tenantId, accountId, linkId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedLinkId = assertObjectId(linkId, 'guestLinkId');

  const link = await guestLinkRepository.findById(normalizedLinkId, normalizedTenantId);
  if (!link) {
    throw new AppError('Guest link not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_GUEST_LINK_NOT_FOUND,
    });
  }

  const { topic, member } = await topicService.getTopicContext(
    normalizedTenantId,
    normalizedAccountId,
    link.topicId
  );
  assertTopicManage(normalizedAccountId, topic, member);

  const updated = await guestLinkRepository.updateById(normalizedLinkId, normalizedTenantId, {
    status: 'revoked',
    revokedAt: new Date(),
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'guest_link_revoked',
    actorId: normalizedAccountId,
    payload: { guest_link_id: String(updated._id) },
  });

  return toGuestLinkDto(updated);
}

async function getGuestPreview(rawToken) {
  const link = await loadLinkByToken(rawToken);
  assertLinkUsable(link);

  const topic = await topicRepository.findById(link.topicId, link.tenantId);
  const workspace = await workspaceRepository.findById(link.workspaceId, link.tenantId);

  return {
    link: {
      label: link.label || null,
      role: link.role,
      require_name: link.requireName,
      require_email: link.requireEmail,
      password_enabled: link.passwordEnabled,
      allow_anonymous_name: link.allowAnonymousName,
      expires_at: link.expiresAt || null,
    },
    topic: topic
      ? {
        id: String(topic._id),
        title: topic.title,
        status: topic.status,
        description: topic.description || null,
      }
      : null,
    workspace: workspace
      ? {
        id: String(workspace._id),
        name: workspace.name,
      }
      : null,
  };
}

async function countLinksByTopic(topicId) {
  const links = await guestLinkRepository.listByTopic(topicId);
  const counts = { active: 0, expired: 0, revoked: 0 };
  links.forEach((link) => {
    const status = resolveLinkStatus(link);
    if (counts[status] !== undefined) counts[status] += 1;
  });
  return counts;
}

module.exports = {
  createGuestLink,
  revokeGuestLink,
  getGuestPreview,
  loadLinkByToken,
  assertLinkUsable,
  resolveLinkStatus,
  isLinkExpired,
  countLinksByTopic,
};
