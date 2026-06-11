const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const guestLinkService = require('../services/guestLink.service');

describe('guestLink.service status helpers', () => {
  it('detects expired links by date', () => {
    const link = {
      status: 'active',
      expiresAt: new Date(Date.now() - 60_000),
      usedCount: 0,
      maxUses: null,
    };
    assert.equal(guestLinkService.isLinkExpired(link), true);
    assert.equal(guestLinkService.resolveLinkStatus(link), 'expired');
  });

  it('detects exhausted links by max uses', () => {
    const link = {
      status: 'active',
      expiresAt: null,
      usedCount: 3,
      maxUses: 3,
    };
    assert.equal(guestLinkService.isLinkExpired(link), false);
    assert.equal(guestLinkService.resolveLinkStatus(link), 'expired');
  });

  it('keeps active links usable', () => {
    const link = {
      status: 'active',
      expiresAt: new Date(Date.now() + 3_600_000),
      usedCount: 1,
      maxUses: 10,
    };
    assert.equal(guestLinkService.resolveLinkStatus(link), 'active');
  });

  it('returns revoked status', () => {
    const link = {
      status: 'revoked',
      expiresAt: null,
      usedCount: 0,
      maxUses: null,
    };
    assert.equal(guestLinkService.resolveLinkStatus(link), 'revoked');
  });
});
