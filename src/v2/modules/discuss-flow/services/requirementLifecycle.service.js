const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const requirementRepository = require('../repositories/discussFlowRequirement.repository');
const requirementVersionRepository = require('../repositories/discussFlowRequirementVersion.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const { toRequirementDto, toRequirementVersionDto } = require('../dto/discussFlow.dto');
const { pickString } = require('../helpers/payload.helper');
const {
  assertActorCanSubmitForReview,
  assertActorCanApproveOrLock,
} = require('../helpers/discussFlowPermission.helper');
const {
  assertRequirementTransition,
  assertRequirementEditable,
} = require('../helpers/discussFlowLifecycle.helper');
const {
  emitRequirementReviewSubmitted,
  emitRequirementApproved,
  emitRequirementLocked,
  emitRequirementVersionCreated,
} = require('../helpers/discussFlowSocketEvents.helper');
const { emitTruthPanelUpdate } = require('../helpers/truthPanel.helper');

function buildActor(accountId, tenantId) {
  return { actorType: 'user', actorId: String(accountId), tenantId: String(tenantId) };
}

async function loadRequirement(tenantId, requirementId) {
  const normalizedRequirementId = assertObjectId(requirementId, 'requirementId');
  const row = await requirementRepository.findById(normalizedRequirementId, tenantId);
  if (!row) {
    throw new AppError('Requirement not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_REQUIREMENT_NOT_FOUND,
    });
  }
  return row;
}

async function submitRequirementReview(tenantId, accountId, requirementId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const requirement = await loadRequirement(normalizedTenantId, requirementId);

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, requirement.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanSubmitForReview(actor, topic, member);
  assertRequirementTransition(requirement.status, 'review');

  const row = await requirementRepository.updateById(requirement._id, normalizedTenantId, {
    status: 'review',
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'requirement_review_submitted',
    actorId: normalizedAccountId,
    payload: { requirement_id: String(row._id) },
  });

  const dto = toRequirementDto(row);
  emitRequirementReviewSubmitted(topic._id, dto);
  await emitTruthPanelUpdate(actor, topic);
  return dto;
}

async function approveRequirement(tenantId, accountId, requirementId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const requirement = await loadRequirement(normalizedTenantId, requirementId);

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, requirement.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanApproveOrLock(actor, topic, member);
  assertRequirementTransition(requirement.status, 'approved');

  const row = await requirementRepository.updateById(requirement._id, normalizedTenantId, {
    status: 'approved',
    approvedBy: normalizedAccountId,
    approvedAt: new Date(),
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'requirement_approved',
    actorId: normalizedAccountId,
    payload: { requirement_id: String(row._id) },
  });

  const dto = toRequirementDto(row);
  emitRequirementApproved(topic._id, dto);
  await emitTruthPanelUpdate(actor, topic);
  return dto;
}

async function lockRequirement(tenantId, accountId, requirementId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const requirement = await loadRequirement(normalizedTenantId, requirementId);

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, requirement.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanApproveOrLock(actor, topic, member);
  assertRequirementTransition(requirement.status, 'locked');

  const changeReason = pickString(payload, 'change_reason', 'changeReason');
  const versionRow = await requirementVersionRepository.create({
    tenantId: normalizedTenantId,
    requirementId: requirement._id,
    topicId: topic._id,
    version: requirement.version || 1,
    title: requirement.title,
    description: requirement.description,
    status: 'locked',
    priority: requirement.priority,
    changeReason,
    createdBy: normalizedAccountId,
  });

  const row = await requirementRepository.updateById(requirement._id, normalizedTenantId, {
    status: 'locked',
    lockedBy: normalizedAccountId,
    lockedAt: new Date(),
    lockedVersion: requirement.version || 1,
    changeReason,
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'requirement_locked',
    actorId: normalizedAccountId,
    payload: { requirement_id: String(row._id), version: row.version },
  });
  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'truth_updated',
    actorId: normalizedAccountId,
    payload: { entity_type: 'requirement', entity_id: String(row._id), status: 'locked' },
  });

  const dto = toRequirementDto(row);
  emitRequirementLocked(topic._id, dto);
  emitRequirementVersionCreated(topic._id, dto, toRequirementVersionDto(versionRow));
  await emitTruthPanelUpdate(actor, topic);
  return { requirement: dto, version: toRequirementVersionDto(versionRow) };
}

async function createRequirementNewVersion(tenantId, accountId, requirementId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const requirement = await loadRequirement(normalizedTenantId, requirementId);

  if (requirement.status !== 'locked') {
    throw new AppError('New version can only be created from locked requirement', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
    });
  }

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, requirement.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanApproveOrLock(actor, topic, member);

  const changeReason = pickString(payload, 'change_reason', 'changeReason') || 'New version from locked requirement';
  const nextVersion = (requirement.version || 1) + 1;

  const row = await requirementRepository.create({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    title: requirement.title,
    description: requirement.description,
    status: 'draft',
    priority: requirement.priority,
    version: nextVersion,
    parentRequirementId: requirement._id,
    changeReason,
    createdBy: normalizedAccountId,
    linkedDecisionIds: requirement.linkedDecisionIds || [],
    linkedTaskIds: requirement.linkedTaskIds || [],
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'requirement_version_created',
    actorId: normalizedAccountId,
    payload: {
      requirement_id: String(row._id),
      parent_requirement_id: String(requirement._id),
      version: nextVersion,
    },
  });

  const dto = toRequirementDto(row);
  emitRequirementVersionCreated(topic._id, dto, { version: nextVersion });
  await emitTruthPanelUpdate(actor, topic);
  return dto;
}

async function listRequirementVersions(tenantId, accountId, requirementId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const requirement = await loadRequirement(normalizedTenantId, requirementId);
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, requirement.topicId);
  const { assertActorTopicRead } = require('../helpers/discussFlowPermission.helper');
  assertActorTopicRead(buildActor(normalizedAccountId, normalizedTenantId), topic, member);

  const items = await requirementVersionRepository.listByRequirement(requirement._id);
  return { items: items.map(toRequirementVersionDto) };
}

module.exports = {
  submitRequirementReview,
  approveRequirement,
  lockRequirement,
  createRequirementNewVersion,
  listRequirementVersions,
  assertRequirementEditable,
};
