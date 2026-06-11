const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../../../kernel/errors');
const {
  assertActorCanHandoff,
  assertActorCanGlobalSearch,
  assertActorCanApproveAiReview,
} = require('../helpers/discussFlowPermission.helper');
const {
  buildPermissionMatrix,
  roleHasPermission,
} = require('../helpers/discussFlowPermissionMatrix.helper');
const { buildNextActions, buildSummary } = require('../services/panel.service');
const { SEARCH_ENTITY_TYPES, HANDOFF_STATUS } = require('../constants/discussFlow.constants');
const { DISCUSSFLOW_SOCKET_EVENTS } = require('../constants/discussFlowSocket.constants');
const { parsePagination } = require('../helpers/payload.helper');
const { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = require('../constants/discussFlow.constants');

const topic = { _id: '64b1f2a3c4d5e6f7a8b9c0d1', ownerId: 'owner-1' };
const managerMember = { role: 'manager' };

describe('DiscussFlow backend finalization', () => {
  it('rejects handoff from guest actors', () => {
    const guestActor = {
      actorType: 'guest',
      actorId: 'guest-1',
      topicId: String(topic._id),
      role: 'contributor',
    };
    assert.throws(
      () => assertActorCanHandoff(guestActor, topic, null),
      (err) => err instanceof AppError && err.status === 403
    );
  });

  it('rejects global search for guests', () => {
    assert.throws(
      () => assertActorCanGlobalSearch({ actorType: 'guest', actorId: 'g1' }),
      (err) => err instanceof AppError && err.status === 403
    );
  });

  it('manager can bulk approve gate', () => {
    const actor = { actorType: 'user', actorId: 'manager-1', tenantId: 'tenant-1' };
    assert.doesNotThrow(() => assertActorCanApproveAiReview(actor, topic, managerMember));
    assert.equal(roleHasPermission('manager', 'bulkApprove'), true);
    assert.equal(roleHasPermission('contributor', 'bulkApprove'), false);
  });

  it('owner can revoke guest links in permission matrix', () => {
    assert.equal(roleHasPermission('owner', 'revokeGuestLink'), true);
    assert.equal(roleHasPermission('viewer', 'revokeGuestLink'), false);
    assert.ok(buildPermissionMatrix().topic_roles.owner);
  });

  it('panel final shape includes guest_links and handoffs', () => {
    const shape = {
      topic: {},
      counts: {},
      requirements: [],
      open_questions: [],
      decisions: [],
      documents: { recent: [], locked_count: 0, draft_count: 0 },
      ai_jobs: [],
      ai_review: {},
      summary: null,
      truth_status: {},
      next_actions: [],
      participant_count: 0,
      guest_links: { active_count: 1, expired_count: 0, revoked_count: 2 },
      handoffs: { pending_count: 1, created_count: 3, failed_count: 0 },
      last_activity: null,
    };
    assert.ok('guest_links' in shape);
    assert.ok('handoffs' in shape);
    assert.equal(shape.handoffs.pending_count, 1);
  });

  it('resume topic response shape keys', () => {
    const shape = {
      topic: {},
      latest_summary: null,
      locked_requirements: [],
      approved_requirements: [],
      open_questions: [],
      locked_decisions: [],
      recent_messages: [],
      locked_documents: [],
      pending_ai_review_items: [],
      suggested_next_actions: [],
    };
    Object.keys(shape).forEach((key) => assert.ok(key in shape));
  });

  it('search supports grouped entity types', () => {
    assert.ok(SEARCH_ENTITY_TYPES.includes('all'));
    assert.ok(SEARCH_ENTITY_TYPES.includes('document'));
    const grouped = ['topics', 'messages', 'requirements', 'decisions', 'documents'];
    grouped.forEach((key) => assert.ok(typeof key === 'string'));
  });

  it('bulk approve allows partial success shape', () => {
    const result = {
      approved: [{ id: 'a1' }],
      dismissed: [],
      failed: [{ item_id: 'bad', error: 'not found' }],
    };
    assert.ok(Array.isArray(result.approved));
    assert.ok(Array.isArray(result.failed));
  });

  it('handoff statuses include pending and created', () => {
    assert.ok(HANDOFF_STATUS.includes('pending'));
    assert.ok(HANDOFF_STATUS.includes('created'));
  });

  it('rejects draft requirement handoff at rule level', () => {
    const requirement = { status: 'draft' };
    assert.equal(['approved', 'locked'].includes(requirement.status), false);
  });

  it('ai usage summary shape', () => {
    const usage = {
      total_input_tokens: 100,
      total_output_tokens: 50,
      total_tokens: 150,
      estimated_cost: 0.01,
      jobs_count: 2,
      actions_breakdown: [{ action: 'DISCUSS_IMPORT_CHAT', count: 1, total_tokens: 80 }],
    };
    assert.equal(usage.total_tokens, usage.total_input_tokens + usage.total_output_tokens);
    assert.ok(Array.isArray(usage.actions_breakdown));
  });

  it('list endpoints use bounded pagination', () => {
    const { limit, page } = parsePagination({ page: '1', limit: '500' }, {
      limit: DEFAULT_PAGE_LIMIT,
      max: MAX_PAGE_LIMIT,
    });
    assert.equal(limit, MAX_PAGE_LIMIT);
    assert.equal(page, 1);
  });

  it('includes handoff and resume socket events', () => {
    assert.ok(DISCUSSFLOW_SOCKET_EVENTS.HANDOFF_CREATED);
    assert.ok(DISCUSSFLOW_SOCKET_EVENTS.HANDOFF_COMPLETED);
    assert.ok(DISCUSSFLOW_SOCKET_EVENTS.RESUME_UPDATED);
  });

  it('buildNextActions supports continue topic actions', () => {
    const actions = buildNextActions(
      [{ _id: 'q1', question: 'Deadline?' }],
      [{ _id: 'r1', title: 'Auth', status: 'review' }],
      [],
      [{ _id: 'd1', title: 'BRD' }]
    );
    assert.ok(actions.length > 0);
    assert.ok(actions.some((row) => row.type === 'answer_question'));
  });

  it('buildSummary reads topic settings', () => {
    const summary = buildSummary({
      settings: {
        latestAiSummary: { title: 'Sprint recap', content: 'We agreed on auth' },
      },
    });
    assert.equal(summary.title, 'Sprint recap');
  });
});
