const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const guestTokenService = require('../services/guestToken.service');

describe('guestToken.service', () => {
  it('hashes guest link tokens deterministically', () => {
    const first = guestTokenService.hashGuestLinkToken('share-token-abc');
    const second = guestTokenService.hashGuestLinkToken('share-token-abc');
    assert.equal(first, second);
    assert.notEqual(first, 'share-token-abc');
    assert.equal(first.length, 64);
  });

  it('generates unique raw guest link tokens', () => {
    const a = guestTokenService.generateGuestLinkToken();
    const b = guestTokenService.generateGuestLinkToken();
    assert.notEqual(a, b);
    assert.ok(a.length >= 32);
  });

  it('signs and verifies guest session JWT', () => {
    const session = {
      sessionId: 'sess-1',
      guestLinkId: '64b1f2a3c4d5e6f7a8b9c0d1',
      tenantId: '64b1f2a3c4d5e6f7a8b9c0d2',
      workspaceId: '64b1f2a3c4d5e6f7a8b9c0d3',
      topicId: '64b1f2a3c4d5e6f7a8b9c0d4',
      role: 'commenter',
      permissions: { sendMessage: true },
      name: 'Alex Guest',
      email: 'alex@example.com',
    };

    const token = guestTokenService.signGuestSession(session);
    const payload = guestTokenService.verifyGuestSession(token);
    assert.equal(payload.sub, session.sessionId);
    assert.equal(payload.topicId, session.topicId);
    assert.equal(payload.role, 'commenter');
    assert.equal(payload.name, 'Alex Guest');
  });
});
