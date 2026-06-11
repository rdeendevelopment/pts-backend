const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { AppError } = require('../../../kernel/errors');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const guestLinkRepository = require('../repositories/discussFlowGuestLink.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const timelineService = require('./timeline.service');
const guestLinkService = require('./guestLink.service');
const guestTokenService = require('./guestToken.service');
const messageService = require('./message.service');
const { pickString } = require('../helpers/payload.helper');
const { buildGuestActor } = require('../helpers/discussFlowActor.helper');
const { toTopicDto } = require('../dto/discussFlow.dto');

async function joinGuestSession(rawToken, payload = {}) {
  const link = await guestLinkService.loadLinkByToken(rawToken);
  guestLinkService.assertLinkUsable(link);

  const name = pickString(payload, 'name');
  const email = pickString(payload, 'email');
  const password = pickString(payload, 'password');

  if (link.requireName && !name) {
    throw new AppError('Name is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { name: 'name is required' },
    });
  }

  if (link.requireEmail && !email) {
    throw new AppError('Email is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { email: 'email is required' },
    });
  }

  if (!name && !link.allowAnonymousName) {
    throw new AppError('Name is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { name: 'name is required' },
    });
  }

  if (link.passwordEnabled) {
    if (!password) {
      throw new AppError('Password is required', {
        status: 400,
        code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
        fields: { password: 'password is required' },
      });
    }
    const ok = await bcrypt.compare(password, link.passwordHash || '');
    if (!ok) {
      throw new AppError('Invalid guest link password', {
        status: 403,
        code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
      });
    }
  }

  const sessionId = crypto.randomUUID();
  const session = {
    sessionId,
    guestLinkId: link._id,
    tenantId: link.tenantId,
    workspaceId: link.workspaceId,
    topicId: link.topicId,
    role: link.role,
    permissions: link.permissions,
    name: name || 'Guest',
    email: email || null,
  };

  await guestLinkRepository.incrementUsedCount(link._id);

  await timelineService.recordEvent({
    topicId: link.topicId,
    tenantId: link.tenantId,
    eventType: 'guest_joined_topic',
    actorId: null,
    payload: {
      guest_link_id: String(link._id),
      guest_session_id: sessionId,
      guest_name: session.name,
      role: link.role,
    },
  });

  const guestSessionToken = guestTokenService.signGuestSession(session);
  const topic = await topicRepository.findById(link.topicId, link.tenantId);

  return {
    guest_session_token: guestSessionToken,
    session: {
      session_id: sessionId,
      role: link.role,
      permissions: link.permissions,
      topic_id: String(link.topicId),
      workspace_id: String(link.workspaceId),
      name: session.name,
      email: session.email,
    },
    topic: topic ? toTopicDto(topic) : null,
  };
}

function getGuestSessionInfo(session) {
  return {
    session_id: session.sessionId,
    role: session.role,
    permissions: session.permissions,
    topic_id: String(session.topicId),
    workspace_id: String(session.workspaceId),
    name: session.name,
    email: session.email,
  };
}

async function sendGuestMessage(session, payload = {}) {
  const actor = buildGuestActor(session);
  const message = await messageService.createMessageWithActor(actor, session.topicId, payload, {
    isGuest: true,
  });
  return message;
}

module.exports = {
  joinGuestSession,
  getGuestSessionInfo,
  sendGuestMessage,
};
