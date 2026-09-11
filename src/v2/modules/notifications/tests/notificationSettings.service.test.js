const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../../../config/env');
const service = require('../services/notificationSettings.service');

function settings() {
  return {
    enabled: true,
    modules: {
      tasks: { enabled: true, events: { assigned: true, mentioned: true } },
      timesheets: { enabled: true, events: { submission_reminder: true, clock_auto_stopped: true, approved: true } },
      projects: { enabled: true, events: { user_assigned: true } },
    },
  };
}

test('environment master overrides enabled database settings', async () => {
  const previous = env.v2.notificationsEnabled;
  env.v2.notificationsEnabled = false;
  service.setCachedSettings(settings());
  try { assert.equal(await service.isEnabled({ type: 'task_primary_assigned' }), false); }
  finally { env.v2.notificationsEnabled = previous; service.clearCache(); }
});

test('global, module, and individual event switches are evaluated hierarchically', async () => {
  const value = settings();
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'task_primary_assigned' }), true);
  value.modules.tasks.events.assigned = false;
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'task_primary_assigned' }), false);
  assert.equal(await service.isEnabled({ type: 'task_mentioned' }), true);
  value.modules.tasks.enabled = false;
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'task_mentioned' }), false);
  value.enabled = false;
  value.modules.tasks.enabled = true;
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'task_mentioned' }), false);
  service.clearCache();
});

test('module off then on preserves event preferences', async () => {
  const value = settings();
  value.modules.tasks.events.assigned = false;
  value.modules.tasks.enabled = false;
  value.modules.tasks.enabled = true;
  assert.equal(value.modules.tasks.events.assigned, false);
});

test('timesheet submission reminder respects event, module, and global switches', async () => {
  const value = settings();
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'activity_week_submission_reminder' }), true);
  value.modules.timesheets.events.submission_reminder = false;
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'activity_week_submission_reminder' }), false);
  value.modules.timesheets.events.submission_reminder = true;
  value.modules.timesheets.enabled = false;
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'activity_week_submission_reminder' }), false);
  value.modules.timesheets.enabled = true;
  value.enabled = false;
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'activity_week_submission_reminder' }), false);
  service.clearCache();
});

test('automatic clock stop notification has its own Timesheets event switch', async () => {
  const value = settings();
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'activity_clock_auto_stopped' }), true);
  value.modules.timesheets.events.clock_auto_stopped = false;
  service.setCachedSettings(value);
  assert.equal(await service.isEnabled({ type: 'activity_clock_auto_stopped' }), false);
  service.clearCache();
});

test('unknown modules and events are rejected', () => {
  assert.throws(() => service.validateSettings({ enabled: true, modules: { unknown: { enabled: true, events: {} } } }));
  assert.throws(() => service.validateSettings({ enabled: true, modules: { tasks: { enabled: true, events: { imaginary: true } } } }));
});
