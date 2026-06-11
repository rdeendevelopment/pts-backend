const { AppError } = require('../../../kernel/errors');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const {
  REQUIREMENT_TRANSITIONS,
  DECISION_TRANSITIONS,
  DOCUMENT_TRANSITIONS,
} = require('../constants/discussFlow.constants');

function assertTransition(currentStatus, nextStatus, transitions, entityName) {
  const allowed = transitions[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(`Invalid ${entityName} status transition`, {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { from: currentStatus, to: nextStatus, allowed },
    });
  }
}

function assertRequirementTransition(currentStatus, nextStatus) {
  assertTransition(currentStatus, nextStatus, REQUIREMENT_TRANSITIONS, 'requirement');
}

function assertDecisionTransition(currentStatus, nextStatus) {
  assertTransition(currentStatus, nextStatus, DECISION_TRANSITIONS, 'decision');
}

function assertDocumentTransition(currentStatus, nextStatus) {
  assertTransition(currentStatus, nextStatus, DOCUMENT_TRANSITIONS, 'document');
}

function assertRequirementEditable(requirement) {
  if (requirement.status === 'locked') {
    throw new AppError('Locked requirement cannot be edited', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_LOCKED_IMMUTABLE,
    });
  }
}

function assertDecisionEditable(decision) {
  if (decision.status === 'locked') {
    throw new AppError('Locked decision cannot be edited', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_LOCKED_IMMUTABLE,
    });
  }
}

function assertDocumentEditable(document) {
  if (document.status === 'locked') {
    throw new AppError('Locked document cannot be edited', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_LOCKED_IMMUTABLE,
    });
  }
}

function assertDocumentPatchAllowed(document, updates = {}) {
  assertDocumentEditable(document);

  const lockedOnlyFields = ['linkedRequirementIds', 'linkedDecisionIds', 'title', 'content'];
  if (document.status === 'locked') {
    const attempted = lockedOnlyFields.filter((field) => updates[field] !== undefined);
    if (attempted.length) {
      throw new AppError('Locked document fields cannot be edited', {
        status: 403,
        code: discussFlowErrorCodes.DISCUSS_FLOW_LOCKED_IMMUTABLE,
        details: { fields: attempted },
      });
    }
  }
}

module.exports = {
  assertRequirementTransition,
  assertDecisionTransition,
  assertDocumentTransition,
  assertRequirementEditable,
  assertDecisionEditable,
  assertDocumentEditable,
  assertDocumentPatchAllowed,
};
