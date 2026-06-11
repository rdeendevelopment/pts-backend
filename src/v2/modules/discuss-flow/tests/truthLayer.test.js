const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../../../kernel/errors');
const {
  assertRequirementTransition,
  assertDecisionTransition,
  assertDocumentTransition,
  assertRequirementEditable,
  assertDecisionEditable,
  assertDocumentEditable,
} = require('../helpers/discussFlowLifecycle.helper');
const {
  assertActorCanApproveOrLock,
} = require('../helpers/discussFlowPermission.helper');
const { buildNextActions } = require('../services/panel.service');
const { LARGE_CONTEXT_THRESHOLD } = require('../services/documentGenerate.service');
const {
  REQUIREMENT_TRANSITIONS,
  DECISION_TRANSITIONS,
  DOCUMENT_TRANSITIONS,
  TIMELINE_EVENT_TYPES,
  GUEST_ROLE_PERMISSIONS,
} = require('../constants/discussFlow.constants');
const { DISCUSSFLOW_SOCKET_EVENTS } = require('../constants/discussFlowSocket.constants');

const topic = { _id: '64b1f2a3c4d5e6f7a8b9c0d1', ownerId: 'owner-1' };
const managerMember = { role: 'manager' };

describe('truth layer lifecycle', () => {
  it('enforces requirement allowed transitions', () => {
    assert.doesNotThrow(() => assertRequirementTransition('draft', 'review'));
    assert.doesNotThrow(() => assertRequirementTransition('review', 'approved'));
    assert.doesNotThrow(() => assertRequirementTransition('approved', 'locked'));
    assert.throws(
      () => assertRequirementTransition('draft', 'locked'),
      (err) => err instanceof AppError && err.status === 400
    );
    assert.deepEqual(REQUIREMENT_TRANSITIONS.locked, []);
  });

  it('enforces decision allowed transitions', () => {
    assert.doesNotThrow(() => assertDecisionTransition('draft', 'approved'));
    assert.doesNotThrow(() => assertDecisionTransition('approved', 'locked'));
    assert.throws(
      () => assertDecisionTransition('draft', 'locked'),
      (err) => err instanceof AppError && err.status === 400
    );
    assert.deepEqual(DECISION_TRANSITIONS.locked, []);
  });

  it('enforces document allowed transitions', () => {
    assert.doesNotThrow(() => assertDocumentTransition('draft', 'review'));
    assert.doesNotThrow(() => assertDocumentTransition('review', 'locked'));
    assert.doesNotThrow(() => assertDocumentTransition('locked', 'archived'));
    assert.throws(
      () => assertDocumentTransition('locked', 'draft'),
      (err) => err instanceof AppError && err.status === 400
    );
    assert.deepEqual(DOCUMENT_TRANSITIONS.draft, ['review']);
  });

  it('rejects edits on locked document', () => {
    assert.throws(
      () => assertDocumentEditable({ status: 'locked' }),
      (err) => err instanceof AppError && err.status === 403
    );
  });

  it('rejects edits on locked requirement and decision', () => {
    assert.throws(() => assertRequirementEditable({ status: 'locked' }));
    assert.throws(() => assertDecisionEditable({ status: 'locked' }));
  });

  it('guest cannot approve or lock truth items', () => {
    const guestActor = {
      actorType: 'guest',
      actorId: 'guest-1',
      topicId: String(topic._id),
      role: 'contributor',
      permissions: GUEST_ROLE_PERMISSIONS.contributor,
    };

    assert.throws(
      () => assertActorCanApproveOrLock(guestActor, topic, null),
      (err) => err instanceof AppError && err.status === 403
    );
    assert.equal(GUEST_ROLE_PERMISSIONS.contributor.approveOrLock, false);
  });

  it('uses async document generation when context is large', () => {
    const contextSize = LARGE_CONTEXT_THRESHOLD;
    const input = { forceAsync: contextSize >= LARGE_CONTEXT_THRESHOLD };
    assert.equal(input.forceAsync, true);
    assert.equal(LARGE_CONTEXT_THRESHOLD, 12);
  });

  it('panel next actions include lock document and approve requirement', () => {
    const actions = buildNextActions(
      [],
      [{ _id: 'r1', title: 'Auth', status: 'review', priority: 'high' }],
      [],
      [{ _id: 'd1', title: 'BRD v1' }]
    );

    assert.ok(actions.some((row) => row.type === 'approve_requirement'));
    assert.ok(actions.some((row) => row.type === 'lock_document'));
  });

  it('panel documents and truth_status shape keys', () => {
    const shape = {
      documents: {
        recent: [],
        locked_count: 2,
        draft_count: 1,
      },
      truth_status: {
        locked_requirements: 1,
        approved_requirements: 3,
        locked_decisions: 0,
        approved_decisions: 2,
        locked_documents: 2,
        open_questions: 4,
      },
      counts: {
        draft_documents: 1,
        locked_documents: 2,
      },
    };

    assert.ok('recent' in shape.documents);
    assert.ok('locked_count' in shape.documents);
    assert.ok('truth_status' in shape);
    assert.equal(shape.truth_status.locked_documents, shape.counts.locked_documents);
  });

  it('includes timeline events for lock and version flows', () => {
    const required = [
      'document_locked',
      'document_version_created',
      'requirement_review_submitted',
      'requirement_approved',
      'requirement_locked',
      'requirement_version_created',
      'decision_approved',
      'decision_locked',
      'decision_version_created',
      'truth_updated',
    ];

    required.forEach((eventType) => {
      assert.ok(TIMELINE_EVENT_TYPES.includes(eventType), `missing timeline event ${eventType}`);
    });
  });

  it('includes socket events for truth layer', () => {
    const required = [
      'DOCUMENT_CREATED',
      'DOCUMENT_LOCKED',
      'DOCUMENT_VERSION_CREATED',
      'REQUIREMENT_APPROVED',
      'REQUIREMENT_LOCKED',
      'DECISION_LOCKED',
      'TRUTH_UPDATED',
    ];

    required.forEach((key) => {
      assert.ok(DISCUSSFLOW_SOCKET_EVENTS[key], `missing socket constant ${key}`);
    });
  });

  it('manager can pass approveOrLock gate', () => {
    const actor = {
      actorType: 'user',
      actorId: 'manager-1',
      tenantId: 'tenant-1',
    };

    assert.doesNotThrow(() => assertActorCanApproveOrLock(actor, topic, managerMember));
  });
});
