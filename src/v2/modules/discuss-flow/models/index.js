const { ensureDiscussFlowWorkspaceIndexes } = require('./discussFlowWorkspace.model');
const { ensureDiscussFlowTopicIndexes } = require('./discussFlowTopic.model');
const { ensureDiscussFlowTopicMemberIndexes } = require('./discussFlowTopicMember.model');
const { ensureDiscussFlowMessageIndexes } = require('./discussFlowMessage.model');
const { ensureDiscussFlowRequirementIndexes } = require('./discussFlowRequirement.model');
const { ensureDiscussFlowQuestionIndexes } = require('./discussFlowQuestion.model');
const { ensureDiscussFlowDecisionIndexes } = require('./discussFlowDecision.model');
const { ensureDiscussFlowTimelineIndexes } = require('./discussFlowTimeline.model');
const { ensureDiscussFlowGuestLinkIndexes } = require('./discussFlowGuestLink.model');
const { ensureDiscussFlowImportBatchIndexes } = require('./discussFlowImportBatch.model');
const { ensureDiscussFlowAiReviewItemIndexes } = require('./discussFlowAiReviewItem.model');
const { ensureDiscussFlowDocumentIndexes } = require('./discussFlowDocument.model');
const { ensureDiscussFlowDocumentVersionIndexes } = require('./discussFlowDocumentVersion.model');
const { ensureDiscussFlowRequirementVersionIndexes } = require('./discussFlowRequirementVersion.model');
const { ensureDiscussFlowDecisionVersionIndexes } = require('./discussFlowDecisionVersion.model');
const { ensureDiscussFlowHandoffIndexes } = require('./discussFlowHandoff.model');

async function ensureDiscussFlowModuleIndexes() {
  await ensureDiscussFlowWorkspaceIndexes();
  await ensureDiscussFlowTopicIndexes();
  await ensureDiscussFlowTopicMemberIndexes();
  await ensureDiscussFlowMessageIndexes();
  await ensureDiscussFlowRequirementIndexes();
  await ensureDiscussFlowQuestionIndexes();
  await ensureDiscussFlowDecisionIndexes();
  await ensureDiscussFlowTimelineIndexes();
  await ensureDiscussFlowGuestLinkIndexes();
  await ensureDiscussFlowImportBatchIndexes();
  await ensureDiscussFlowAiReviewItemIndexes();
  await ensureDiscussFlowDocumentIndexes();
  await ensureDiscussFlowDocumentVersionIndexes();
  await ensureDiscussFlowRequirementVersionIndexes();
  await ensureDiscussFlowDecisionVersionIndexes();
  await ensureDiscussFlowHandoffIndexes();
}

module.exports = {
  ensureDiscussFlowModuleIndexes,
};
