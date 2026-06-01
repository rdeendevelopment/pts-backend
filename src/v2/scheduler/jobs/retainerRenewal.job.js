const env = require('../../config/env');
const { info, error } = require('../../kernel/logger');
const { runRetainerAutoRenewalJob } = require('../../modules/projects/services/retainerRenewal.service');
const scheduledJobRunRepository = require('../../modules/scheduler/repositories/scheduledJobRun.repository');

const JOB_NAME = 'retainer.autoRenewal';

async function executeRetainerRenewalJob(trigger = 'agenda', agendaJobId = null) {
  const startedAt = new Date();
  let runDoc = null;

  try {
    runDoc = await scheduledJobRunRepository.createRun({
      jobName: JOB_NAME,
      trigger,
      status: 'running',
      startedAt,
      agendaJobId,
    });

    const results = await runRetainerAutoRenewalJob(new Date());
    const finishedAt = new Date();

    await scheduledJobRunRepository.updateRun(runDoc._id, {
      status: results.errors?.length ? 'completed_with_errors' : 'completed',
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      result: results,
    });

    info('Retainer auto-renewal job completed', { trigger, ...results });
    return results;
  } catch (err) {
    error('Retainer auto-renewal job failed', { trigger, message: err.message });

    if (runDoc?._id) {
      await scheduledJobRunRepository.updateRun(runDoc._id, {
        status: 'failed',
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: err.message,
      }).catch(() => {});
    }

    throw err;
  }
}

function registerRetainerRenewalJob(agenda) {
  agenda.define(JOB_NAME, { concurrency: 1, lockLifetime: 10 * 60 * 1000 }, async (job) => {
    await executeRetainerRenewalJob('agenda', job.attrs._id);
  });
}

async function scheduleRetainerRenewalJob(agenda) {
  if (!env.v2.retainerAutoRenewal.enabled) {
    return null;
  }

  const expression = env.v2.retainerAutoRenewal.cronExpression;
  await agenda.every(
    expression,
    JOB_NAME,
    {},
    { timezone: env.v2.businessTimezone, skipImmediate: true },
  );

  info('Retainer auto-renewal scheduled with Agenda', {
    jobName: JOB_NAME,
    expression,
    timezone: env.v2.businessTimezone,
  });

  return expression;
}

module.exports = {
  JOB_NAME,
  executeRetainerRenewalJob,
  registerRetainerRenewalJob,
  scheduleRetainerRenewalJob,
};
