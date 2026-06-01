const { Router } = require('express');
const { asyncHandler } = require('../kernel/middleware');
const { sendSuccess } = require('../kernel/responses');
const { getBootstrapState, getV2DatabaseStatus } = require('../bootstrap');
const env = require('../config/env');

const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const bootstrap = getBootstrapState();
    const mongo = getV2DatabaseStatus();

    let status;
    if (!env.v2.enabled) {
      status = 'disabled';
    } else if (bootstrap.ready && mongo.ready) {
      status = 'ok';
    } else {
      status = 'degraded';
    }

    const payload = {
      status,
      api: 'v2',
      environment: env.nodeEnv,
      enabled: env.v2.enabled,
      bootstrap,
      mongo,
    };

    const statusCode = status === 'ok' ? 200 : 503;
    return sendSuccess(res, payload, { status: statusCode });
  })
);

module.exports = router;
