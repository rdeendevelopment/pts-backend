const test = require('node:test');
const assert = require('node:assert/strict');
const requireNotificationSettingsAdmin = require('../middleware/requireNotificationSettingsAdmin');

function invoke(accountType, roles = []) {
  let forwarded = null;
  requireNotificationSettingsAdmin(
    { v2Auth: { account: { accountType }, sessionAccess: { roles } } },
    {},
    (error) => { forwarded = error || null; },
  );
  return forwarded;
}

test('notification settings allow current platform administrator account types', () => {
  assert.equal(invoke('super_admin'), null);
  assert.equal(invoke('admin'), null);
  assert.equal(invoke('employee', [{ key: 'super_admin' }]), null);
  assert.equal(invoke('employee', [{ key: 'admin' }]), null);
});

test('notification settings reject non-administrator account types', () => {
  for (const accountType of ['manager', 'employee', 'client', null]) {
    const error = invoke(accountType);
    assert.equal(error?.status, 403);
  }
});
