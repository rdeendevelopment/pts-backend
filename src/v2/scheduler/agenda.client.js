const Agenda = require('agenda');
const env = require('../config/env');
const { info, warn } = require('../kernel/logger');
const { getV2Connection } = require('../database/connection');

const AGENDA_COLLECTION = 'pts_agenda_jobs';

let agendaInstance = null;
let agendaReadyPromise = null;

function createAgendaInstance() {
  const instance = new Agenda({
    processEvery: env.v2.agenda.processEvery,
    maxConcurrency: env.v2.agenda.maxConcurrency,
    defaultConcurrency: 1,
    lockLimit: 1,
    defaultLockLimit: 1,
    disableAutoIndex: true,
  });

  instance.on('ready', () => {
    info('Agenda scheduler ready', { collection: AGENDA_COLLECTION });
  });

  instance.on('error', (err) => {
    warn('Agenda scheduler error', { message: err.message });
  });

  return instance;
}

async function getAgenda() {
  if (agendaInstance) {
    return agendaInstance;
  }

  if (!agendaReadyPromise) {
    agendaReadyPromise = (async () => {
      const connection = getV2Connection();
      const instance = createAgendaInstance();
      instance.mongo(connection.db, AGENDA_COLLECTION);
      await instance.start();
      agendaInstance = instance;
      return instance;
    })().catch((err) => {
      agendaReadyPromise = null;
      throw err;
    });
  }

  return agendaReadyPromise;
}

async function stopAgenda() {
  if (!agendaInstance) return;
  await agendaInstance.stop();
  agendaInstance = null;
  agendaReadyPromise = null;
  info('Agenda scheduler stopped');
}

module.exports = {
  AGENDA_COLLECTION,
  getAgenda,
  stopAgenda,
};
