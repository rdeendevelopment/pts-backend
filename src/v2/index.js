const { Router } = require('express');
const {
  requestId,
  requestLogger,
  errorHandler,
  asyncHandler,
} = require('./kernel/middleware');
const healthRoutes = require('./routes/health.routes');
const authModule = require('./modules/auth');
const modulesModule = require('./modules/modules');
const rbacModule = require('./modules/rbac');
const usersModule = require('./modules/users');
const clientsModule = require('./modules/clients');
const projectsModule = require('./modules/projects');
const activityModule = require('./modules/activity');
const tasksModule = require('./modules/tasks');
const notificationsModule = require('./modules/notifications');
const socketModule = require('./modules/socket');
const reportsModule = require('./modules/reports');
const converseModule = require('./modules/converse');
const announcementsModule = require('./modules/announcements');
const boardSharesModule = require('./modules/board-shares');
const schedulerModule = require('./modules/scheduler');
const dailyFlowModule = require('./modules/daily-flow');
const aiModule = require('./modules/ai');
const discussFlowModule = require('./modules/discuss-flow');
const uploadsRoutes = require('./routes/uploads.routes');
const { bootstrap, getBootstrapState } = require('./bootstrap');
const { getV2MongoStatus } = require('./database/connection');
const env = require('./config/env');
const { AppError, errorCodes } = require('./kernel/errors');

const router = Router();

router.use(requestId);
router.use(requestLogger);

router.use(healthRoutes);

if (env.v2.enabled) {
  router.use(asyncHandler(async (_req, _res, next) => {
    if (getV2MongoStatus().ready) {
      return next();
    }

    const state = getBootstrapState();
    if (!state.ready) {
      try {
        await bootstrap();
      } catch (_) {
        // bootstrap logs the failure; fall through to readiness check
      }
    }

    if (!getV2MongoStatus().ready) {
      throw new AppError('PTS v2 is starting up. Please retry shortly.', {
        status: 503,
        code: errorCodes.SERVICE_UNAVAILABLE,
      });
    }

    next();
  }));

  router.use('/auth', authModule.routes);
  router.use('/modules', modulesModule.routes);
  router.use('/rbac', rbacModule.routes);
  router.use('/users', usersModule.routes);
  router.use('/clients', clientsModule.routes);
  router.use('/projects', projectsModule.routes);
  router.use('/activity', activityModule.routes);
  router.use('/tasks', tasksModule.routes);
  router.use('/notifications', notificationsModule.routes);
  router.use('/board-shares', boardSharesModule.routes);
  router.use('/socket', socketModule.routes);
  router.use('/reports', reportsModule.routes);
  router.use('/converse', converseModule.routes);
  router.use('/announcements', announcementsModule.routes);
  router.use('/scheduler', schedulerModule.routes);
  router.use('/daily-flow', dailyFlowModule.routes);
  router.use('/ai', aiModule.routes);
  router.use('/discuss-flow', discussFlowModule.routes);
  router.use('/uploads', uploadsRoutes);

  router.use((req, res, next) => {
    next(new AppError('Not Found', {
      status: 404,
      code: errorCodes.NOT_FOUND,
      details: { path: req.originalUrl },
    }));
  });
} else {
  router.use((req, res, next) => {
    next(new AppError('PTS v2 API is disabled', {
      status: 503,
      code: errorCodes.SERVICE_DISABLED,
      details: {
        hint: 'Set PTS_V2_ENABLED=true to enable v2 business routes.',
        path: req.originalUrl,
      },
    }));
  });
}

router.use(errorHandler);

module.exports = {
  router,
  bootstrap,
  getBootstrapState,
};
