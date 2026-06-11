const { connectMongo, mongoose } = require('../../config/mongo');
const env = require('./config/env');
const { info, warn, error } = require('./kernel/logger');
const { connectV2Database, getV2MongoStatus } = require('./database/connection');

let bootstrapPromise = null;
let bootstrapState = {
  ready: false,
  disabled: false,
  bootstrappedAt: null,
  environment: env.nodeEnv,
  lastError: null,
};

function recordBootstrapError(err) {
  if (!err) return;
  bootstrapState.lastError = {
    message: err.message || String(err),
    code: err.code || null,
    at: new Date().toISOString(),
  };
}

function getMongoStatus() {
  return {
    ready: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    name: mongoose.connection.name || null,
  };
}

async function ensureMongoReady() {
  const existing = getMongoStatus();

  if (existing.ready) {
    return { ...existing, reusedExistingConnection: true };
  }

  await connectMongo();

  const afterConnect = getMongoStatus();
  return { ...afterConnect, reusedExistingConnection: false };
}

async function runBootstrapMaintenance() {
  const { ensureAuthIndexes } = require('./modules/auth');
  await ensureAuthIndexes();
  info('PTS v2 auth indexes ensured');

  const { ensureModuleIndexes, seedSystemModules } = require('./modules/modules');
  await ensureModuleIndexes();
  await seedSystemModules();

  const { ensureRbacIndexes, seedRbac } = require('./modules/rbac');
  await ensureRbacIndexes();
  await seedRbac();

  const { ensureUserIndexes } = require('./modules/users');
  await ensureUserIndexes();
  info('PTS v2 user indexes ensured');

  const { ensureClientModuleIndexes } = require('./modules/clients');
  await ensureClientModuleIndexes();
  info('PTS v2 client indexes ensured');

  const { ensureProjectModuleIndexes } = require('./modules/projects');
  await ensureProjectModuleIndexes();
  info('PTS v2 project indexes ensured');

  const { bootstrapActivityModule } = require('./modules/activity');
  await bootstrapActivityModule();
  info('PTS v2 activity indexes and work categories ensured');

  const { ensureTaskModuleIndexes } = require('./modules/tasks');
  await ensureTaskModuleIndexes();
  info('PTS v2 task indexes ensured');

  const { bootstrapReportsModule } = require('./modules/reports');
  await bootstrapReportsModule();
  info('PTS v2 report indexes ensured');

  const { ensureConverseModuleIndexes } = require('./modules/converse');
  await ensureConverseModuleIndexes();
  info('PTS v2 converse indexes ensured');

  const { ensureAnnouncementsModuleIndexes } = require('./modules/announcements');
  await ensureAnnouncementsModuleIndexes();
  info('PTS v2 announcement indexes ensured');

  const { ensureBoardShareIndexes } = require('./modules/board-shares');
  await ensureBoardShareIndexes();
  info('PTS v2 board share indexes ensured');

  const { ensureSchedulerModuleIndexes } = require('./modules/scheduler');
  await ensureSchedulerModuleIndexes();
  info('PTS v2 scheduler indexes ensured');

  const { ensureDailyFlowModuleIndexes } = require('./modules/daily-flow');
  await ensureDailyFlowModuleIndexes();
  info('PTS v2 daily flow indexes ensured');

  const { ensureAiModuleIndexes, bootstrapAiModule } = require('./modules/ai');
  await ensureAiModuleIndexes();
  bootstrapAiModule();
  info('PTS v2 AI module indexes ensured and worker started');

  const { ensureDiscussFlowModuleIndexes } = require('./modules/discuss-flow');
  await ensureDiscussFlowModuleIndexes();
  info('PTS v2 discuss flow indexes ensured');
}

async function bootstrap() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    if (!env.v2.enabled) {
      bootstrapState = {
        ready: false,
        disabled: true,
        bootstrappedAt: new Date().toISOString(),
        environment: env.nodeEnv,
        reason: 'PTS_V2_ENABLED=false',
        mongo: getMongoStatus(),
      };

      warn('PTS v2 business routes disabled via PTS_V2_ENABLED=false');
      return bootstrapState;
    }

    info('Starting PTS v2 bootstrap', {
      environment: env.nodeEnv,
      apiPrefix: env.v2.apiPrefix,
    });

    const mongo = await ensureMongoReady();
    const v2Mongo = await connectV2Database();

    bootstrapState = {
      ready: v2Mongo.readyState === 1,
      disabled: false,
      bootstrappedAt: new Date().toISOString(),
      environment: env.nodeEnv,
      mongo: {
        ready: v2Mongo.readyState === 1,
        readyState: v2Mongo.readyState,
        name: v2Mongo.name,
        legacy: {
          ready: mongo.ready,
          readyState: mongo.readyState,
          name: mongo.name,
          reusedExistingConnection: mongo.reusedExistingConnection,
        },
      },
    };

    if (v2Mongo.readyState !== 1) {
      recordBootstrapError(
        new Error(
          'V2 MongoDB connection did not become ready. '
          + 'Check MONGO_URI, MONGO_V2_DB, Atlas IP allowlist, and server logs.'
        )
      );
      warn('PTS v2 bootstrap completed but v2 Mongo is not ready', bootstrapState);
      return bootstrapState;
    }

    bootstrapState.lastError = null;

    try {
      await runBootstrapMaintenance();
      info('PTS v2 bootstrap completed', bootstrapState);
    } catch (err) {
      warn('PTS v2 bootstrap maintenance failed; API remains available', {
        message: err.message,
      });
    }

    try {
      const { startScheduler } = require('./scheduler');
      await startScheduler();

      if (global.__ptsExpressApp) {
        const { mountAgendashDashboard } = require('./scheduler/agendash');
        await mountAgendashDashboard(global.__ptsExpressApp);
      }
    } catch (err) {
      warn('PTS v2 scheduler startup failed', { message: err.message });
    }

    return bootstrapState;
  })().catch((err) => {
    bootstrapPromise = null;
    bootstrapState.ready = false;
    bootstrapState.disabled = false;
    recordBootstrapError(err);
    error('PTS v2 bootstrap failed', { message: err.message, stack: err.stack });
    throw err;
  });

  return bootstrapPromise;
}

function getBootstrapState() {
  return { ...bootstrapState };
}

function getV2DatabaseStatus() {
  return getV2MongoStatus();
}

module.exports = {
  bootstrap,
  getBootstrapState,
  getMongoStatus,
  getV2DatabaseStatus,
  ensureMongoReady,
};
