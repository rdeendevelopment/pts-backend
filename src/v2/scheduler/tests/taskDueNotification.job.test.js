const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../../config/env');
const {
  JOB_NAME,
  scheduleTaskDueNotificationJob,
} = require('../jobs/taskDueNotification.job');

function fakeAgenda(initialJobs = []) {
  const jobs = initialJobs.map((job) => ({ ...job }));
  return {
    jobs,
    async cancel(query) {
      let removed = 0;
      for (let index = jobs.length - 1; index >= 0; index -= 1) {
        if (jobs[index].name === query.name) {
          jobs.splice(index, 1);
          removed += 1;
        }
      }
      return removed;
    },
    async every(interval, name, data, options) {
      jobs.push({ name, type: 'single', interval, data, options });
      return jobs[jobs.length - 1];
    },
  };
}

async function withMasterFlag(enabled, run) {
  const previous = env.v2.notificationsEnabled;
  env.v2.notificationsEnabled = enabled;
  try { return await run(); } finally { env.v2.notificationsEnabled = previous; }
}

function dueJobs(agenda) {
  return agenda.jobs.filter((job) => job.name === JOB_NAME);
}

test('flag true reconciles to one 15-minute recurring job', async () => {
  const agenda = fakeAgenda();
  await withMasterFlag(true, () => scheduleTaskDueNotificationJob(agenda));
  assert.equal(dueJobs(agenda).length, 1);
  assert.equal(dueJobs(agenda)[0].interval, '15 minutes');
  assert.equal(dueJobs(agenda)[0].type, 'single');
});

test('repeated enabled startup still leaves exactly one job', async () => {
  const agenda = fakeAgenda();
  await withMasterFlag(true, async () => {
    await scheduleTaskDueNotificationJob(agenda);
    await scheduleTaskDueNotificationJob(agenda);
  });
  assert.equal(dueJobs(agenda).length, 1);
});

test('flag false removes all persisted stale copies', async () => {
  const agenda = fakeAgenda([
    { name: JOB_NAME }, { name: 'other.job' }, { name: JOB_NAME },
  ]);
  await withMasterFlag(false, () => scheduleTaskDueNotificationJob(agenda));
  assert.equal(dueJobs(agenda).length, 0);
  assert.equal(agenda.jobs.some((job) => job.name === 'other.job'), true);
});

test('repeated disabled startup is a safe no-op', async () => {
  const agenda = fakeAgenda();
  await withMasterFlag(false, async () => {
    await scheduleTaskDueNotificationJob(agenda);
    await scheduleTaskDueNotificationJob(agenda);
  });
  assert.equal(dueJobs(agenda).length, 0);
});

test('true to false rollout removes the recurring job', async () => {
  const agenda = fakeAgenda();
  await withMasterFlag(true, () => scheduleTaskDueNotificationJob(agenda));
  assert.equal(dueJobs(agenda).length, 1);
  await withMasterFlag(false, () => scheduleTaskDueNotificationJob(agenda));
  assert.equal(dueJobs(agenda).length, 0);
});

test('false to true rollout recreates one correctly configured job', async () => {
  const agenda = fakeAgenda([{ name: JOB_NAME }, { name: JOB_NAME }]);
  await withMasterFlag(false, () => scheduleTaskDueNotificationJob(agenda));
  await withMasterFlag(true, () => scheduleTaskDueNotificationJob(agenda));
  assert.deepEqual(dueJobs(agenda).map(({ name, interval, type }) => ({ name, interval, type })), [{
    name: JOB_NAME,
    interval: '15 minutes',
    type: 'single',
  }]);
});
