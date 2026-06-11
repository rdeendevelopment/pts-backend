const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicMemberRepository = require('../repositories/discussFlowTopicMember.repository');
const { getDiscussFlowTopicRoom } = require('../../socket/helpers/socketRooms.helper');
const { hasTopicRole } = require('../helpers/discussFlowPermission.helper');

async function assertDiscussFlowTopicRoomAccess(topicId, accountId) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');

  const topic = await topicRepository.findById(normalizedTopicId, normalizedAccountId);
  if (!topic) {
    throw new AppError('Topic not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_TOPIC_NOT_FOUND,
    });
  }

  if (String(topic.ownerId) === String(normalizedAccountId)) {
    return getDiscussFlowTopicRoom(topic._id);
  }

  const member = await topicMemberRepository.findByTopicAndAccount(topic._id, normalizedAccountId);
  if (!member || !hasTopicRole(member, 'viewer')) {
    throw new AppError('Topic socket access denied', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }

  return getDiscussFlowTopicRoom(topic._id);
}

module.exports = {
  assertDiscussFlowTopicRoomAccess,
};
