const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const decisionRepository = require('../repositories/discussFlowDecision.repository');
const decisionVersionRepository = require('../repositories/discussFlowDecisionVersion.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const { toDecisionDto, toDecisionVersionDto } = require('../dto/discussFlow.dto');
const { pickString } = require('../helpers/payload.helper');
const {
  assertActorCanApproveOrLock,
  assertActorTopicRead,
} = require('../helpers/discussFlowPermission.helper');
const {
  assertDecisionTransition,
} = require('../helpers/discussFlowLifecycle.helper');
const {
  emitDecisionApproved,
  emitDecisionLocked,
  emitDecisionVersionCreated,
} = require('../helpers/discussFlowSocketEvents.helper');
const { emitTruthPanelUpdate } = require('../helpers/truthPanel.helper');

function buildActor(accountId, tenantId) {
  return { actorType: 'user', actorId: String(accountId), tenantId: String(tenantId) };
}

async function loadDecision(tenantId, decisionId) {
  const normalizedDecisionId = assertObjectId(decisionId, 'decisionId');
  const row = await decisionRepository.findById(normalizedDecisionId, tenantId);
  if (!row) {
    throw new AppError('Decision not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_DECISION_NOT_FOUND,
    });
  }
  return row;
}

async function approveDecision(tenantId, accountId, decisionId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const decision = await loadDecision(normalizedTenantId, decisionId);

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, decision.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanApproveOrLock(actor, topic, member);
  assertDecisionTransition(decision.status, 'approved');

  const row = await decisionRepository.updateById(decision._id, normalizedTenantId, {
    status: 'approved',
    approvedBy: normalizedAccountId,
    approvedAt: new Date(),
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'decision_approved',
    actorId: normalizedAccountId,
    payload: { decision_id: String(row._id) },
  });

  const dto = toDecisionDto(row);
  emitDecisionApproved(topic._id, dto);
  await emitTruthPanelUpdate(actor, topic);
  return dto;
}

async function lockDecision(tenantId, accountId, decisionId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const decision = await loadDecision(normalizedTenantId, decisionId);

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, decision.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanApproveOrLock(actor, topic, member);
  assertDecisionTransition(decision.status, 'locked');

  const changeReason = pickString(payload, 'change_reason', 'changeReason');
  const versionRow = await decisionVersionRepository.create({
    tenantId: normalizedTenantId,
    decisionId: decision._id,
    topicId: topic._id,
    version: decision.version || 1,
    title: decision.title,
    context: decision.context,
    impact: decision.impact,
    status: 'locked',
    changeReason,
    createdBy: normalizedAccountId,
  });

  const row = await decisionRepository.updateById(decision._id, normalizedTenantId, {
    status: 'locked',
    lockedBy: normalizedAccountId,
    lockedAt: new Date(),
    changeReason,
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'decision_locked',
    actorId: normalizedAccountId,
    payload: { decision_id: String(row._id), version: row.version },
  });
  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'truth_updated',
    actorId: normalizedAccountId,
    payload: { entity_type: 'decision', entity_id: String(row._id), status: 'locked' },
  });

  const dto = toDecisionDto(row);
  emitDecisionLocked(topic._id, dto);
  emitDecisionVersionCreated(topic._id, dto, toDecisionVersionDto(versionRow));
  await emitTruthPanelUpdate(actor, topic);
  return { decision: dto, version: toDecisionVersionDto(versionRow) };
}

async function createDecisionNewVersion(tenantId, accountId, decisionId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const decision = await loadDecision(normalizedTenantId, decisionId);

  if (decision.status !== 'locked') {
    throw new AppError('New version can only be created from locked decision', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
    });
  }

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, decision.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanApproveOrLock(actor, topic, member);

  const changeReason = pickString(payload, 'change_reason', 'changeReason') || 'New version from locked decision';
  const nextVersion = (decision.version || 1) + 1;

  const row = await decisionRepository.create({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    title: decision.title,
    context: decision.context,
    impact: decision.impact,
    status: 'draft',
    ownerId: normalizedAccountId,
    version: nextVersion,
    parentDecisionId: decision._id,
    changeReason,
    linkedRequirements: decision.linkedRequirements || [],
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'decision_version_created',
    actorId: normalizedAccountId,
    payload: {
      decision_id: String(row._id),
      parent_decision_id: String(decision._id),
      version: nextVersion,
    },
  });

  const dto = toDecisionDto(row);
  emitDecisionVersionCreated(topic._id, dto, { version: nextVersion });
  await emitTruthPanelUpdate(actor, topic);
  return dto;
}

async function listDecisionVersions(tenantId, accountId, decisionId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const decision = await loadDecision(normalizedTenantId, decisionId);
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, decision.topicId);
  assertActorTopicRead(buildActor(normalizedAccountId, normalizedTenantId), topic, member);

  const items = await decisionVersionRepository.listByDecision(decision._id);
  return { items: items.map(toDecisionVersionDto) };
}

module.exports = {
  approveDecision,
  lockDecision,
  createDecisionNewVersion,
  listDecisionVersions,
};
