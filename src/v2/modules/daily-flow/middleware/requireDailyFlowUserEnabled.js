const { AppError } = require('../../../kernel/errors');
const dailyFlowErrorCodes = require('../errors/dailyFlowErrorCodes');
const settingsService = require('../services/dailyFlowSettings.service');

/**
 * Blocks user-facing Daily Flow routes when the per-user setting is disabled.
 * Does not apply to /status, /settings, or admin routes.
 */
async function requireDailyFlowUserEnabled(req, _res, next) {
  try {
    const settings = await settingsService.getSettingsRecord(req.v2Auth.accountId);

    if (!settings.enable_daily_flow) {
      throw new AppError('Daily Flow is disabled for this user', {
        status: 403,
        code: dailyFlowErrorCodes.DAILY_FLOW_DISABLED_FOR_USER,
        details: {
          hint: 'PATCH /api/v2/daily-flow/settings with enable_daily_flow: true to re-enable.',
        },
      });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = requireDailyFlowUserEnabled;
