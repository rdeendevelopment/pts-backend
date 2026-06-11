const { assertObjectId } = require('../../../kernel/validators/objectId');
const topicMemberRepository = require('../repositories/discussFlowTopicMember.repository');
const topicService = require('./topic.service');
const { toTopicMemberDto } = require('../dto/discussFlow.dto');
const { assertTopicManage, assertValidTopicRole } = require('../helpers/discussFlowPermission.helper');
const { pickString } = require('../helpers/payload.helper');

async function listMembers(tenantId, accountId, topicId) {
  const { topic, member } = await topicService.getTopicContext(tenantId, accountId, topicId);
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { assertTopicRead } = require('../helpers/discussFlowPermission.helper');
  assertTopicRead(normalizedAccountId, topic, member);

  const rows = await topicMemberRepository.listByTopic(topic._id);
  return rows.map(toTopicMemberDto);
}

async function addMember(tenantId, accountId, topicId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  assertTopicManage(normalizedAccountId, topic, member);

  const targetAccountId = assertObjectId(payload.account_id || payload.accountId, 'accountId');
  const role = pickString(payload, 'role') || 'contributor';
  assertValidTopicRole(role);

  const existing = await topicMemberRepository.findByTopicAndAccount(topic._id, targetAccountId);
  if (existing) return toTopicMemberDto(existing);

  const row = await topicMemberRepository.create({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    accountId: targetAccountId,
    role,
    permissions: payload.permissions || {},
    notificationSettings: payload.notification_settings || payload.notificationSettings || {},
  });

  return toTopicMemberDto(row);
}

module.exports = {
  listMembers,
  addMember,
};
