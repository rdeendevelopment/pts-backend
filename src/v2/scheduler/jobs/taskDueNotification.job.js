const env = require('../../config/env');
const { info, error } = require('../../kernel/logger');
const { runDueNotifications } = require('../../modules/tasks/services/taskDueNotification.service');

const JOB_NAME = 'tasks.dueNotifications';

async function executeTaskDueNotificationJob(now = new Date()) {
  const result = await runDueNotifications(now, env.v2.businessTimezone);
  info('Task due notifications completed', result);
  return result;
}

function registerTaskDueNotificationJob(agenda) {
  agenda.define(JOB_NAME, { concurrency: 1, lockLifetime: 10 * 60 * 1000 }, async () => {
    try { await executeTaskDueNotificationJob(); }
    catch (err) { error('Task due notifications failed', { message: err.message }); throw err; }
  });
}

async function scheduleTaskDueNotificationJob(agenda) {
  // Reconcile persisted state on every process startup. `cancel` removes every
  // stale copy and is a no-op when none exists, making both enable and rollback
  // safe across redeploys.
  await agenda.cancel({ name: JOB_NAME });
  if (!env.v2.notificationsEnabled) return null;
  await agenda.every('15 minutes', JOB_NAME, {}, {
    timezone: env.v2.businessTimezone, skipImmediate: false,
  });
  return JOB_NAME;
}

module.exports = { JOB_NAME, executeTaskDueNotificationJob, registerTaskDueNotificationJob, scheduleTaskDueNotificationJob };
