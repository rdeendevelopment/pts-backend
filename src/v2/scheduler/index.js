const env = require('../config/env');
const { info, warn } = require('../kernel/logger');
const { getAgenda, stopAgenda } = require('./agenda.client');
const {
  registerRetainerRenewalJob,
  scheduleRetainerRenewalJob,
  executeRetainerRenewalJob,
} = require('./jobs/retainerRenewal.job');

let started = false;

async function startScheduler() {
  if (!env.v2.enabled || !env.v2.agenda.enabled) {
    return null;
  }

  if (started) {
    return getAgenda();
  }

  const agenda = await getAgenda();
  registerRetainerRenewalJob(agenda);
  await scheduleRetainerRenewalJob(agenda);
  started = true;
  info('PTS scheduler started (Agenda)');
  return agenda;
}

async function stopScheduler() {
  started = false;
  await stopAgenda();
}

module.exports = {
  startScheduler,
  stopScheduler,
  getAgenda,
  executeRetainerRenewalJob,
};
