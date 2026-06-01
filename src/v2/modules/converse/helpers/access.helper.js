const { AppError } = require('../../../kernel/errors');
const converseErrorCodes = require('../errors/converseErrorCodes');
const { ADMIN_ROLES } = require('../constants/converse.constants');
const participantRepository = require('../repositories/participant.repository');

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
  assertCanManageParticipants,
  canManageConverse,
};
