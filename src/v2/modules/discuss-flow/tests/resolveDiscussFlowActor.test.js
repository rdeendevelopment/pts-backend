const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function resolveTopicIdFromRequest(req) {
  const routePath = String(req.route?.path || req.originalUrl || '');
  return req.params.topicId || (routePath.includes('/topics/') ? req.params.id : null);
}

describe('resolveDiscussFlowActor topic id resolution', () => {
  it('uses params.id as topic only on topic-scoped routes', () => {
    const topicRoute = resolveTopicIdFromRequest({
      params: { id: 'topic-abc' },
      route: { path: '/topics/:id/panel' },
    });
    assert.equal(topicRoute, 'topic-abc');
  });

  it('does not treat ai-review item id as topic id', () => {
    const reviewRoute = resolveTopicIdFromRequest({
      params: { id: 'review-item-xyz' },
      route: { path: '/ai-review-items/:id/approve' },
    });
    assert.equal(reviewRoute, null);
  });

  it('prefers explicit topicId param when present', () => {
    const route = resolveTopicIdFromRequest({
      params: { topicId: 'topic-1', id: 'message-2' },
      route: { path: '/topics/:id/messages/:messageId/ai-analyze' },
    });
    assert.equal(route, 'topic-1');
  });
});
