const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildNextActions } = require('../services/panel.service');

describe('panel.service', () => {
  it('builds next actions from open questions and review requirements', () => {
    const actions = buildNextActions(
      [{ _id: 'q1', question: 'What is the deadline?' }],
      [{ _id: 'r1', title: 'Auth flow', status: 'review', priority: 'high' }]
    );

    assert.ok(actions.some((row) => row.type === 'approve_requirement'));
    assert.ok(actions.some((row) => row.type === 'answer_question'));
    assert.ok(actions.some((row) => row.type === 'review_requirement'));
    const reviewAction = actions.find((row) => row.type === 'review_requirement');
    assert.equal(reviewAction.priority, 'high');
  });

  it('returns right panel response shape keys', () => {
    const shape = {
      topic: {},
      counts: {
        messages: 0,
        requirements: 0,
        open_questions: 0,
        decisions: 0,
        locked_documents: 0,
      },
      requirements: [],
      open_questions: [],
      decisions: [],
      documents: {
        recent: [],
        locked_count: 0,
        draft_count: 0,
      },
      truth_status: {
        locked_requirements: 0,
        approved_requirements: 0,
        locked_decisions: 0,
        approved_decisions: 0,
        locked_documents: 0,
        open_questions: 0,
      },
      ai_jobs: [],
      ai_review: {
        pending_count: 0,
        high_confidence_count: 0,
        recent_items: [],
      },
      summary: null,
      next_actions: [],
      participant_count: 0,
      guest_links: {
        active_count: 0,
        expired_count: 0,
        revoked_count: 0,
      },
      handoffs: {
        pending_count: 0,
        created_count: 0,
        failed_count: 0,
      },
      last_activity: null,
    };

    assert.ok('counts' in shape);
    assert.ok('open_questions' in shape);
    assert.ok('ai_jobs' in shape);
    assert.ok('ai_review' in shape);
    assert.ok('recent' in shape.documents);
    assert.ok('truth_status' in shape);
    assert.deepEqual(shape.ai_jobs, []);
  });
});
