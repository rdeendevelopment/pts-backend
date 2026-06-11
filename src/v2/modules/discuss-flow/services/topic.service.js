const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const workspaceRepository = require('../repositories/discussFlowWorkspace.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicMemberRepository = require('../repositories/discussFlowTopicMember.repository');
const timelineService = require('./timeline.service');
const { toTopicDto } = require('../dto/discussFlow.dto');
const { pickString, pickArray, pickField, parsePagination } = require('../helpers/payload.helper');
const { ensureUniqueSlug } = require('../helpers/slug.helper');
const {
  TOPIC_STATUS,
  TOPIC_PRIORITY,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} = require('../constants/discussFlow.constants');
const {
  assertWorkspaceRead,
  assertTopicRead,
  assertTopicManage,
} = require('../helpers/discussFlowPermission.helper');

function assertEnum(value, allowed, field) {
  if (value && !allowed.includes(value)) {
    throw new AppError(`Invalid ${field}`, {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { field, allowed },
    });
  }
}

async function getTopicContext(tenantId, accountId, topicId) {
  const topic = await topicRepository.findById(assertObjectId(topicId, 'topicId'), assertObjectId(tenantId, 'tenantId'));
  if (!topic) {
    throw new AppError('Topic not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_TOPIC_NOT_FOUND,
    });
  }
  const member = await topicMemberRepository.findByTopicAndAccount(topic._id, accountId);
  return { topic, member };
}

async function createTopic(tenantId, accountId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const workspaceId = assertObjectId(payload.workspace_id || payload.workspaceId, 'workspaceId');

  const workspace = await workspaceRepository.findById(workspaceId, normalizedTenantId);
  if (!workspace) {
    throw new AppError('Workspace not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_WORKSPACE_NOT_FOUND,
    });
  }
  assertWorkspaceRead(normalizedAccountId, workspace);

  const title = pickString(payload, 'title');
  if (!title) {
    throw new AppError('Topic title is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { title: 'title is required' },
    });
  }

  const priority = pickString(payload, 'priority') || 'medium';
  assertEnum(priority, TOPIC_PRIORITY, 'priority');

  const slug = await ensureUniqueSlug(
    pickString(payload, 'slug') || title,
    (candidate) => topicRepository.slugExists(workspaceId, candidate)
  );

  const topic = await topicRepository.create({
    workspaceId,
    tenantId: normalizedTenantId,
    title,
    slug,
    description: pickString(payload, 'description'),
    status: 'active',
    priority,
    category: pickString(payload, 'category'),
    tags: pickArray(payload, 'tags') || [],
    createdBy: normalizedAccountId,
    ownerId: normalizedAccountId,
    lastActivityAt: new Date(),
    timelineEnabled: true,
    settings: payload.settings || {},
  });

  await topicMemberRepository.create({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    accountId: normalizedAccountId,
    role: 'owner',
    joinedAt: new Date(),
  });

  await workspaceRepository.incrementTopicCount(workspaceId, normalizedTenantId, 1);

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'topic_created',
    actorId: normalizedAccountId,
    payload: { title, workspace_id: String(workspaceId) },
  });

  return toTopicDto(topic);
}

async function listTopics(tenantId, accountId, query = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const { limit, page, skip } = parsePagination(query, { limit: DEFAULT_PAGE_LIMIT, max: MAX_PAGE_LIMIT });
  const workspaceId = query.workspace_id || query.workspaceId;

  const { items, total } = await topicRepository.list(normalizedTenantId, {
    workspaceId: workspaceId ? assertObjectId(workspaceId, 'workspaceId') : undefined,
    status: pickString(query, 'status'),
    search: pickString(query, 'q', 'search'),
    limit,
    skip,
  });

  const visible = [];
  for (const row of items) {
    const member = await topicMemberRepository.findByTopicAndAccount(row._id, accountId);
    try {
      assertTopicRead(accountId, row, member);
      visible.push(toTopicDto(row));
    } catch (_) {
      // skip inaccessible topics in list
    }
  }

  return {
    items: visible,
    meta: { page, limit, total },
  };
}

async function getTopic(tenantId, accountId, topicId) {
  const { topic, member } = await getTopicContext(tenantId, accountId, topicId);
  assertTopicRead(accountId, topic, member);
  return toTopicDto(topic);
}

async function updateTopic(tenantId, accountId, topicId, payload = {}) {
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const { topic, member } = await getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  assertTopicManage(normalizedAccountId, topic, member);

  const updates = {};
  const title = pickString(payload, 'title');
  if (title) updates.title = title;

  if (pickField(payload, 'description') !== undefined) {
    updates.description = pickString(payload, 'description');
  }

  const status = pickString(payload, 'status');
  if (status) {
    assertEnum(status, TOPIC_STATUS, 'status');
    updates.status = status;
  }

  const priority = pickString(payload, 'priority');
  if (priority) {
    assertEnum(priority, TOPIC_PRIORITY, 'priority');
    updates.priority = priority;
  }

  if (pickField(payload, 'category') !== undefined) updates.category = pickString(payload, 'category');
  if (pickArray(payload, 'tags')) updates.tags = pickArray(payload, 'tags');
  if (payload.settings !== undefined) updates.settings = payload.settings;

  updates.lastActivityAt = new Date();

  const row = await topicRepository.updateById(topic._id, normalizedTenantId, updates);
  return toTopicDto(row);
}

module.exports = {
  getTopicContext,
  createTopic,
  listTopics,
  getTopic,
  updateTopic,
};
