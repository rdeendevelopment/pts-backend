const { AppError } = require('../../../kernel/errors');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const {
  TOPIC_MEMBER_ROLES,
  GUEST_ROLES,
  GUEST_ROLE_PERMISSIONS,
} = require('../constants/discussFlow.constants');
const { assertActorTopicScope } = require('./discussFlowActor.helper');

const ROLE_RANK = {
  owner: 50,
  manager: 40,
  contributor: 30,
  commenter: 20,
  viewer: 10,
};

function isWorkspaceOwner(accountId, workspace) {
  return workspace && String(workspace.ownerId) === String(accountId);
}

function hasTopicRole(member, minRole) {
  if (!member) return false;
  const current = ROLE_RANK[member.role] || 0;
  const required = ROLE_RANK[minRole] || 0;
  return current >= required;
}

function assertWorkspaceRead(accountId, workspace) {
  if (!workspace) {
    throw new AppError('Workspace not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_WORKSPACE_NOT_FOUND,
    });
  }

  if (workspace.visibility === 'organization') return;
  if (isWorkspaceOwner(accountId, workspace)) return;
  if (workspace.visibility === 'team') return;

  throw new AppError('Workspace access denied', {
    status: 403,
    code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
  });
}

function assertWorkspaceManage(accountId, workspace) {
  assertWorkspaceRead(accountId, workspace);
  if (!isWorkspaceOwner(accountId, workspace)) {
    throw new AppError('Workspace manage access denied', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }
}

function assertTopicRead(accountId, topic, member) {
  if (!topic) {
    throw new AppError('Topic not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_TOPIC_NOT_FOUND,
    });
  }

  if (String(topic.ownerId) === String(accountId)) return;
  if (member && hasTopicRole(member, 'viewer')) return;

  throw new AppError('Topic access denied', {
    status: 403,
    code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
  });
}

function assertTopicWrite(accountId, topic, member) {
  assertTopicRead(accountId, topic, member);
  if (String(topic.ownerId) === String(accountId)) return;
  if (member && hasTopicRole(member, 'commenter')) return;

  throw new AppError('Topic write access denied', {
    status: 403,
    code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
  });
}

function assertTopicManage(accountId, topic, member) {
  assertTopicRead(accountId, topic, member);
  if (String(topic.ownerId) === String(accountId)) return;
  if (member && hasTopicRole(member, 'manager')) return;

  throw new AppError('Topic manage access denied', {
    status: 403,
    code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
  });
}

function isGuestRole(role) {
  return GUEST_ROLES.includes(role);
}

function assertValidTopicRole(role) {
  if (!TOPIC_MEMBER_ROLES.includes(role)) {
    throw new AppError('Invalid topic member role', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_ROLE,
      details: { allowed: TOPIC_MEMBER_ROLES },
    });
  }
}

function assertValidGuestRole(role) {
  if (!GUEST_ROLES.includes(role)) {
    throw new AppError('Invalid guest role', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_ROLE,
      details: { allowed: GUEST_ROLES },
    });
  }
}

function guestHasPermission(actor, permissionKey) {
  if (!actor || actor.actorType !== 'guest') return false;
  const perms = actor.permissions || GUEST_ROLE_PERMISSIONS[actor.role] || {};
  return Boolean(perms[permissionKey]);
}

function assertActorTopicRead(actor, topic, member) {
  if (actor.actorType === 'guest') {
    assertActorTopicScope(actor, topic._id);
    if (!guestHasPermission(actor, 'readMessages')) {
      throw new AppError('Guest read access denied', {
        status: 403,
        code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
      });
    }
    return;
  }

  assertTopicRead(actor.actorId, topic, member);
}

function assertActorTopicWrite(actor, topic, member) {
  assertActorTopicRead(actor, topic, member);

  if (actor.actorType === 'guest') {
    if (!guestHasPermission(actor, 'sendMessage')) {
      throw new AppError('Guest write access denied', {
        status: 403,
        code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
      });
    }
    return;
  }

  assertTopicWrite(actor.actorId, topic, member);
}

function assertActorCanReply(actor, topic, member) {
  assertActorTopicRead(actor, topic, member);

  if (actor.actorType === 'guest') {
    if (!guestHasPermission(actor, 'replyMessage')) {
      throw new AppError('Guest reply access denied', {
        status: 403,
        code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
      });
    }
    return;
  }

  assertTopicWrite(actor.actorId, topic, member);
}

function assertActorCanReadDocuments(actor, topic, member) {
  assertActorTopicRead(actor, topic, member);
  if (actor.actorType === 'guest' && !guestHasPermission(actor, 'readDocuments')) {
    throw new AppError('Guest document read access denied', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }
}

function assertActorCanCreateDraftDocument(actor, topic, member) {
  assertActorTopicRead(actor, topic, member);
  if (actor.actorType === 'guest') {
    if (!guestHasPermission(actor, 'createDraftDocument')) {
      throw new AppError('Guests cannot create draft documents', {
        status: 403,
        code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
      });
    }
    return;
  }
  assertTopicWrite(actor.actorId, topic, member);
}

function assertActorCanSubmitForReview(actor, topic, member) {
  assertActorCanCreateDraftDocument(actor, topic, member);
  if (actor.actorType === 'guest' && !guestHasPermission(actor, 'submitForReview')) {
    throw new AppError('Guest cannot submit items for review', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }
}

function assertActorCanApproveOrLock(actor, topic, member) {
  if (actor.actorType === 'guest') {
    throw new AppError('Guests cannot approve or lock truth items', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }
  assertTopicManage(actor.actorId, topic, member);
}

function assertActorCanApproveAiReview(actor, topic, member) {
  if (actor.actorType === 'guest') {
    throw new AppError('Guests cannot approve AI review items', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }

  assertTopicManage(actor.actorId, topic, member);
}

function assertActorCanHandoff(actor, topic, member) {
  if (actor.actorType === 'guest') {
    throw new AppError('Guests cannot create handoffs', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_HANDOFF_NOT_ALLOWED,
    });
  }
  assertTopicManage(actor.actorId, topic, member);
}

function assertActorCanGlobalSearch(actor) {
  if (actor?.actorType === 'guest') {
    throw new AppError('Guests cannot use global DiscussFlow search', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }
}

function assertActorCanCreateDraft(actor, entityKey, topic, member) {
  assertActorTopicRead(actor, topic, member);

  if (actor.actorType === 'guest') {
    if (!guestHasPermission(actor, entityKey)) {
      throw new AppError('Guest create access denied', {
        status: 403,
        code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
      });
    }
    return;
  }

  assertTopicWrite(actor.actorId, topic, member);
}

module.exports = {
  ROLE_RANK,
  isWorkspaceOwner,
  hasTopicRole,
  assertWorkspaceRead,
  assertWorkspaceManage,
  assertTopicRead,
  assertTopicWrite,
  assertTopicManage,
  isGuestRole,
  assertValidTopicRole,
  assertValidGuestRole,
  guestHasPermission,
  assertActorTopicRead,
  assertActorTopicWrite,
  assertActorCanReply,
  assertActorCanCreateDraft,
  assertActorCanReadDocuments,
  assertActorCanCreateDraftDocument,
  assertActorCanSubmitForReview,
  assertActorCanApproveOrLock,
  assertActorCanApproveAiReview,
  assertActorCanHandoff,
  assertActorCanGlobalSearch,
};
