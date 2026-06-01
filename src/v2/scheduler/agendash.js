const basicAuth = require('express-basic-auth');
const Agendash = require('agendash');
const env = require('../config/env');
const { info, warn } = require('../kernel/logger');
const { getAgenda } = require('./agenda.client');

let mountedPath = null;

async function mountAgendashDashboard(app) {
  if (!app) {
    throw new Error('Express app is required to mount Agendash');
  }

  if (mountedPath) {
    return mountedPath;
  }

  if (!env.v2.enabled || !env.v2.agenda.enabled || !env.v2.agendash.enabled) {
    return null;
  }

  const username = String(env.v2.agendash.username || '').trim();
  const password = String(env.v2.agendash.password || '');

  if (!username || !password) {
    warn('Agendash is enabled but PTS_AGENDASH_USER / PTS_AGENDASH_PASSWORD are not set; dashboard not mounted');
    return null;
  }

  const agenda = await getAgenda();
  const mountPath = env.v2.agendash.path;

  app.use(
    mountPath,
    basicAuth({
      users: { [username]: password },
      challenge: true,
      realm: 'PTS Agendash',
    }),
  );
  app.use(mountPath, Agendash(agenda));

  mountedPath = mountPath;

  let port = 3000;
  try {
    const constants = require('../../../config/constants');
    port = constants.APP_PORT || port;
  } catch (_err) {
    // ignore
  }

  info('Agendash dashboard ready', {
    url: `http://localhost:${port}${mountPath}`,
    path: mountPath,
    collection: 'pts_agenda_jobs',
    username,
  });

  return mountPath;
}

function getAgendashPath() {
  return mountedPath;
}

module.exports = {
  mountAgendashDashboard,
  getAgendashPath,
};
