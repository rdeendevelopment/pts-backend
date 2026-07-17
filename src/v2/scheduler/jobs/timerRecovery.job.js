const { info, error } = require('../../kernel/logger');
const timerService = require('../../modules/activity/services/timer.service');

const JOB_NAME = 'activity.freezeOverdueTimers';

function registerTimerRecoveryJob(agenda) {
  agenda.define(JOB_NAME, { concurrency: 1, lockLifetime: 2 * 60 * 1000 }, async () => {
    try {
      const result = await timerService.freezeOverdueTimers(new Date());
      if (result.frozen > 0) info('Overdue timers frozen for correction', result);
    } catch (err) {
      error('Overdue timer recovery failed', { message: err.message });
      throw err;
    }
  });
}

async function scheduleTimerRecoveryJob(agenda) {
  await agenda.every('5 minutes', JOB_NAME, {}, { skipImmediate: false });
}

module.exports = {
  JOB_NAME,
  registerTimerRecoveryJob,
  scheduleTimerRecoveryJob,
};
