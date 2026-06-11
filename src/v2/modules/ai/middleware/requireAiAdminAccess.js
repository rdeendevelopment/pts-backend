const { AppError } = require('../../../kernel/errors');
const aiErrorCodes = require('../errors/aiErrorCodes');
const aiEnv = require('../config/ai.env');

/**
 * Internal admin AI routes — super_admin + PTS_AI_DEBUG_ENABLED.
 */
function requireAiAdminAccess(req, _res, next) {
  const accountType = req.v2Auth?.account?.accountType;

  if (accountType !== 'super_admin') {
    throw new AppError('Super admin access required for AI admin routes', {
      status: 403,
      code: aiErrorCodes.AI_FORBIDDEN,
    });
  }

  if (!aiEnv.debugEnabled) {
    throw new AppError('AI debug routes are disabled', {
      status: 403,
      code: aiErrorCodes.AI_DEBUG_REQUIRED,
      details: { hint: 'Set PTS_AI_DEBUG_ENABLED=true' },
    });
  }

  return next();
}

module.exports = requireAiAdminAccess;
