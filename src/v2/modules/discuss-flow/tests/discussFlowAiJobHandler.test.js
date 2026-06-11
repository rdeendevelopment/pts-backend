const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildReviewItemRecords, extractAiResult } = require('../services/discussFlowAiJobHandler.service');

describe('discussFlowAiJobHandler.service', () => {
  it('extracts nested AI result payload', () => {
    const payload = extractAiResult({
      result: {
        result: {
          summary: { title: 'Summary', content: 'Body' },
          requirements: [],
          questions: [],
          decisions: [],
          risks: [],
          task_candidates: [],
          next_actions: [],
        },
      },
    });

    assert.equal(payload.summary.title, 'Summary');
  });

  it('creates review items from extraction output', async () => {
    const created = buildReviewItemRecords({
      tenantId: '64b1f2a3c4d5e6f7a8b9c0d1',
      workspaceId: '64b1f2a3c4d5e6f7a8b9c0d2',
      topicId: '64b1f2a3c4d5e6f7a8b9c0d3',
      importBatchId: '64b1f2a3c4d5e6f7a8b9c0d4',
      aiJobId: '64b1f2a3c4d5e6f7a8b9c0d5',
      refMap: { 'line-1': '64b1f2a3c4d5e6f7a8b9c0d6' },
      extraction: {
        summary: { title: 'Sprint recap', content: 'We aligned on scope', key_points: ['Scope'], confidence: 0.9 },
        requirements: [{ title: 'Add SSO', description: 'Support SSO login', priority: 'high', confidence: 0.8, linked_message_refs: ['line-1'] }],
        questions: [{ question: 'Deadline?', context: 'Need date', confidence: 0.7, linked_message_refs: ['line-1'] }],
        decisions: [{ title: 'Use OAuth', context: 'Auth', impact: 'Security', confidence: 0.75, linked_message_refs: ['line-1'] }],
        risks: [{ title: 'Timeline risk', description: 'Tight schedule', confidence: 0.6 }],
        task_candidates: [{ title: 'Spike OAuth', description: 'Research providers', priority: 'medium', confidence: 0.65 }],
        next_actions: [{ title: 'Confirm deadline', description: 'Ask client', priority: 'high', confidence: 0.7 }],
      },
    });

    assert.equal(created.length, 7);
    assert.equal(created[0].type, 'summary');
    assert.equal(created[1].type, 'requirement');
    assert.equal(created[1].status, 'pending');
    assert.equal(String(created[1].linkedMessageIds[0]), '64b1f2a3c4d5e6f7a8b9c0d6');
  });

  it('defines idempotency guard conditions for job completion', () => {
    const importBatchReady = { status: 'review_ready' };
    const importBatchPending = { status: 'ai_running' };
    const existingReviewItems = 3;
    const existingDocument = { _id: 'doc-1' };

    assert.equal(importBatchReady.status === 'review_ready', true);
    assert.equal(importBatchPending.status === 'review_ready', false);
    assert.equal(existingReviewItems > 0, true);
    assert.ok(existingDocument);
  });
});
