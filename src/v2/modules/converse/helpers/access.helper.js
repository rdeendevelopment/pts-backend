const { AppError } = require('../../../kernel/errors');
const converseErrorCodes = require('../errors/converseErrorCodes');
const { ADMIN_ROLES } = require('../constants/converse.constants');
const participantRepository = require('../repositories/participant.repository');
const conversationRepository = require('../repositories/conversation.repository');
const projectsModule = require('../../projects');
const { isSuperAdmin } = require('../../rbac/helpers/authorize.helper');
const { CONVERSATION_TYPES } = require('../constants/converse.constants');
const userRepository = require('../../users/repositories/user.repository');
const accountRepository = require('../../auth/repositories/account.repository');
const rbacAccessService = require('../../rbac/services/rbacAccess.service');

async function getActiveParticipantOrThrow(conversationId, userId) {
  const membership = await participantRepository.findActiveMembership(conversationId, userId);
  if (!membership) {
    throw new AppError('Not a participant in this conversation', {
      status: 403,
      code: converseErrorCodes.CONVERSE_FORBIDDEN,
    });
  }
  return membership;
}

async function assertProjectAccess(projectId, userId, auth = null) {
  await projectsModule.getProjectForActivity(projectId);
  const superAdminAuth = auth && {
    ...auth,
    sessionAccess: auth.sessionAccess || { roles: auth.roles || [] },
  };
  if (superAdminAuth && isSuperAdmin(superAdminAuth)) return;
  const assignment = await projectsModule.getAssignmentForUser(projectId, userId);
  if (assignment) return;

  // A project room can include an administrator who is not an assigned worker.
  // Resolve that grant through the same RBAC helper used by project APIs.
  const user = await userRepository.findById(userId);
  const account = user?.accountId ? await accountRepository.findById(user.accountId) : null;
  if (user?.status === 'active' && account?.status === 'active') {
    const sessionAccess = await rbacAccessService.getSessionAccessForAccount(account._id);
    if (isSuperAdmin({ account, sessionAccess })) return;
  }

  throw new AppError('Project room access forbidden', {
    status: 403,
    code: converseErrorCodes.CONVERSE_FORBIDDEN,
  });
}

async function getAuthorizedMembership(conversationId, userId, auth = null) {
  const conversation = await conversationRepository.findById(conversationId);
  if (!conversation) {
    throw new AppError('Conversation not found', {
      status: 404,
      code: converseErrorCodes.CONVERSE_NOT_FOUND,
    });
  }
  if (conversation.type === CONVERSATION_TYPES.PROJECT) {
    await assertProjectAccess(conversation.projectId, userId, auth);
    return participantRepository.ensureParticipant(conversationId, userId);
  }
  return getActiveParticipantOrThrow(conversationId, userId);
}

function assertCanManageParticipants(membership) {
  if (!ADMIN_ROLES.has(membership.role)) {
    throw new AppError('Only group admins can manage participants', {
      status: 403,
      code: converseErrorCodes.CONVERSE_FORBIDDEN,
    });
  }
}

function canManageConverse(req) {
  return (req.v2Converse?.permissions || []).includes('converse.manage');
}

module.exports = {
  getActiveParticipantOrThrow,
  getAuthorizedMembership,
  assertProjectAccess,
  assertCanManageParticipants,
  canManageConverse,
};
