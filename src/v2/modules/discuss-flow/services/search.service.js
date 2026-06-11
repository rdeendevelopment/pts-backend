const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const messageRepository = require('../repositories/discussFlowMessage.repository');
const requirementRepository = require('../repositories/discussFlowRequirement.repository');
const decisionRepository = require('../repositories/discussFlowDecision.repository');
const documentRepository = require('../repositories/discussFlowDocument.repository');
const {
  toTopicDto,
  toMessageDto,
  toRequirementDto,
  toDecisionDto,
  toDocumentDto,
} = require('../dto/discussFlow.dto');
const { pickString, parsePagination } = require('../helpers/payload.helper');
const {
  SEARCH_ENTITY_TYPES,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} = require('../constants/discussFlow.constants');
const { assertActorCanGlobalSearch } = require('../helpers/discussFlowPermission.helper');

async function searchDiscussFlow(actor, query = {}) {
  assertActorCanGlobalSearch(actor);

  const normalizedTenantId = assertObjectId(actor.tenantId, 'tenantId');
  const searchTerm = pickString(query, 'q', 'search');
  if (!searchTerm) {
    throw new AppError('Search query is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { q: 'q is required' },
    });
  }

  const entityType = pickString(query, 'type') || 'all';
  if (!SEARCH_ENTITY_TYPES.includes(entityType)) {
    throw new AppError('Invalid search type', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { allowed: SEARCH_ENTITY_TYPES },
    });
  }

  const workspaceId = query.workspace_id || query.workspaceId || null;
  const status = pickString(query, 'status');
  const { limit, page, skip } = parsePagination(query, { limit: DEFAULT_PAGE_LIMIT, max: MAX_PAGE_LIMIT });

  const topicIds = workspaceId
    ? await topicRepository.listIds(normalizedTenantId, assertObjectId(workspaceId, 'workspaceId'))
    : await topicRepository.listIds(normalizedTenantId);

  const results = {
    topics: { items: [], meta: { page, limit, total: 0 } },
    messages: { items: [], meta: { page, limit, total: 0 } },
    requirements: { items: [], meta: { page, limit, total: 0 } },
    decisions: { items: [], meta: { page, limit, total: 0 } },
    documents: { items: [], meta: { page, limit, total: 0 } },
  };

  if (entityType === 'all' || entityType === 'topic') {
    const { items, total } = await topicRepository.list(normalizedTenantId, {
      workspaceId: workspaceId || undefined,
      status,
      search: searchTerm,
      limit,
      skip,
    });
    results.topics = { items: items.map(toTopicDto), meta: { page, limit, total } };
  }

  if (topicIds.length && (entityType === 'all' || entityType === 'message')) {
    const { items, total } = await messageRepository.listByTopicIds(topicIds, {
      search: searchTerm,
      limit,
      skip,
    });
    results.messages = { items: items.map(toMessageDto), meta: { page, limit, total } };
  }

  if (topicIds.length && (entityType === 'all' || entityType === 'requirement')) {
    const { items, total } = await requirementRepository.listByTopicIds(topicIds, {
      status,
      search: searchTerm,
      limit,
      skip,
    });
    results.requirements = { items: items.map(toRequirementDto), meta: { page, limit, total } };
  }

  if (topicIds.length && (entityType === 'all' || entityType === 'decision')) {
    const { items, total } = await decisionRepository.listByTopicIds(topicIds, {
      status,
      search: searchTerm,
      limit,
      skip,
    });
    results.decisions = { items: items.map(toDecisionDto), meta: { page, limit, total } };
  }

  if (topicIds.length && (entityType === 'all' || entityType === 'document')) {
    const { items, total } = await documentRepository.listByTopicIds(topicIds, {
      status,
      search: searchTerm,
      limit,
      skip,
    });
    results.documents = { items: items.map(toDocumentDto), meta: { page, limit, total } };
  }

  return {
    q: searchTerm,
    type: entityType,
    workspace_id: workspaceId ? String(workspaceId) : null,
    status: status || null,
    ...results,
  };
}

module.exports = {
  searchDiscussFlow,
};
