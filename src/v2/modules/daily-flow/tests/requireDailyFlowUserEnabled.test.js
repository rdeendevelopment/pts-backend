const test = require('node:test');
const assert = require('node:assert/strict');
const { AppError } = require('../../../kernel/errors');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');

function buildMiddleware(getSettingsRecord) {
  return async function requireDailyFlowUserEnabled(req, _res, next) {
    try {
      const settings = await getSettingsRecord(req.v2Auth.accountId);
      if (!settings.enable_daily_flow) {
        throw new AppError('Daily Flow is disabled for this user', {
          status: 403,
          code: dailyFlowErrorCodes.DAILY_FLOW_DISABLED_FOR_USER,
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

test('disabled user setting blocks Daily Flow access', async () => {
  const middleware = buildMiddleware(async () => ({ enable_daily_flow: false }));
  let capturedError = null;

  await middleware({ v2Auth: { accountId: '665f1c2d3e4f5a6b7c8d9e0a' } }, {}, (err) => {
    capturedError = err;
  });

  assert.ok(capturedError instanceof AppError);
  assert.equal(capturedError.code, dailyFlowErrorCodes.DAILY_FLOW_DISABLED_FOR_USER);
  assert.equal(capturedError.status, 403);
});

test('enabled user setting allows Daily Flow access', async () => {
  const middleware = buildMiddleware(async () => ({ enable_daily_flow: true }));
  let nextCalled = false;

  await middleware({ v2Auth: { accountId: '665f1c2d3e4f5a6b7c8d9e0a' } }, {}, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
