const { emitBestEffort } = require('../../socket/helpers/socketEmit.helper');
const socketService = require('../../socket/services/socket.service');
const { getDiscussFlowTopicRoom } = require('../../socket/helpers/socketRooms.helper');
const { DISCUSSFLOW_SOCKET_EVENTS } = require('../constants/discussFlowSocket.constants');

function getTopicRoom(topicId) {
  return getDiscussFlowTopicRoom(topicId);
}

function joinTopicRoom(socket, topicId) {
  return socket.join(getTopicRoom(topicId));
}

function leaveTopicRoom(socket, topicId) {
  return socket.leave(getTopicRoom(topicId));
}

function emitToTopic(topicId, event, payload) {
  emitBestEffort(() => {
    socketService.emitToDiscussFlowTopic(topicId, event, payload);
  });
}

function emitMessageCreated(topicId, message, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.MESSAGE_CREATED, { message, ...meta });
}

function emitMessageUpdated(topicId, message, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.MESSAGE_UPDATED, { message, ...meta });
}

function emitMessageDeleted(topicId, message, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.MESSAGE_DELETED, { message, ...meta });
}

function emitRightPanelUpdated(topicId, panel, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.RIGHT_PANEL_UPDATED, { panel, ...meta });
}

function emitRequirementCreated(topicId, requirement, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.REQUIREMENT_CREATED, { requirement, ...meta });
}

function emitQuestionCreated(topicId, question, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.QUESTION_CREATED, { question, ...meta });
}

function emitDecisionCreated(topicId, decision, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DECISION_CREATED, { decision, ...meta });
}

function emitTyping(topicId, payload, isTyping) {
  const event = isTyping
    ? DISCUSSFLOW_SOCKET_EVENTS.TYPING_START
    : DISCUSSFLOW_SOCKET_EVENTS.TYPING_STOP;
  emitToTopic(topicId, event, payload);
}

function emitImportCreated(topicId, importBatch, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.IMPORT_CREATED, { import_batch: importBatch, ...meta });
}

function emitImportMessagesSaved(topicId, importBatch, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.IMPORT_MESSAGES_SAVED, { import_batch: importBatch, ...meta });
}

function emitAiReviewReady(topicId, payload = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.AI_REVIEW_READY, payload);
}

function emitAiReviewFailed(topicId, payload = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.AI_REVIEW_FAILED, payload);
}

function emitAiReviewItemApproved(topicId, item, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.AI_REVIEW_ITEM_APPROVED, { item, ...meta });
}

function emitAiReviewItemDismissed(topicId, item, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.AI_REVIEW_ITEM_DISMISSED, { item, ...meta });
}

function emitDocumentCreated(topicId, document, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DOCUMENT_CREATED, { document, ...meta });
}

function emitDocumentUpdated(topicId, document, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DOCUMENT_UPDATED, { document, ...meta });
}

function emitDocumentDraftCreated(topicId, document, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DOCUMENT_DRAFT_CREATED, { document, ...meta });
}

function emitDocumentReviewSubmitted(topicId, document, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DOCUMENT_REVIEW_SUBMITTED, { document, ...meta });
}

function emitDocumentLocked(topicId, document, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DOCUMENT_LOCKED, { document, ...meta });
}

function emitDocumentVersionCreated(topicId, document, version, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DOCUMENT_VERSION_CREATED, { document, version, ...meta });
}

function emitRequirementReviewSubmitted(topicId, requirement, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.REQUIREMENT_REVIEW_SUBMITTED, { requirement, ...meta });
}

function emitRequirementApproved(topicId, requirement, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.REQUIREMENT_APPROVED, { requirement, ...meta });
}

function emitRequirementLocked(topicId, requirement, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.REQUIREMENT_LOCKED, { requirement, ...meta });
}

function emitRequirementVersionCreated(topicId, requirement, version, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.REQUIREMENT_VERSION_CREATED, { requirement, version, ...meta });
}

function emitDecisionApproved(topicId, decision, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DECISION_APPROVED, { decision, ...meta });
}

function emitDecisionLocked(topicId, decision, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DECISION_LOCKED, { decision, ...meta });
}

function emitDecisionVersionCreated(topicId, decision, version, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.DECISION_VERSION_CREATED, { decision, version, ...meta });
}

function emitTruthUpdated(topicId, payload = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.TRUTH_UPDATED, payload);
}

function emitHandoffCreated(topicId, handoff, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.HANDOFF_CREATED, { handoff, ...meta });
}

function emitHandoffCompleted(topicId, handoff, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.HANDOFF_COMPLETED, { handoff, ...meta });
}

function emitHandoffFailed(topicId, handoff, meta = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.HANDOFF_FAILED, { handoff, ...meta });
}

function emitResumeUpdated(topicId, payload = {}) {
  emitToTopic(topicId, DISCUSSFLOW_SOCKET_EVENTS.RESUME_UPDATED, payload);
}

module.exports = {
  DISCUSSFLOW_SOCKET_EVENTS,
  getTopicRoom,
  joinTopicRoom,
  leaveTopicRoom,
  emitToTopic,
  emitMessageCreated,
  emitMessageUpdated,
  emitMessageDeleted,
  emitRightPanelUpdated,
  emitRequirementCreated,
  emitQuestionCreated,
  emitDecisionCreated,
  emitTyping,
  emitImportCreated,
  emitImportMessagesSaved,
  emitAiReviewReady,
  emitAiReviewFailed,
  emitAiReviewItemApproved,
  emitAiReviewItemDismissed,
  emitDocumentCreated,
  emitDocumentUpdated,
  emitDocumentDraftCreated,
  emitDocumentReviewSubmitted,
  emitDocumentLocked,
  emitDocumentVersionCreated,
  emitRequirementReviewSubmitted,
  emitRequirementApproved,
  emitRequirementLocked,
  emitRequirementVersionCreated,
  emitDecisionApproved,
  emitDecisionLocked,
  emitDecisionVersionCreated,
  emitTruthUpdated,
  emitHandoffCreated,
  emitHandoffCompleted,
  emitHandoffFailed,
  emitResumeUpdated,
};
