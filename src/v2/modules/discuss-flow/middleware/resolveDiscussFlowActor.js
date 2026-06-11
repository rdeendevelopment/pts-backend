const { AppError } = require('../../../kernel/errors');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const { buildGuestActor, buildUserActor } = require('../helpers/discussFlowActor.helper');

async function resolveDiscussFlowActor(req, _res, next) {
  try {
    if (req.dfGuestSession) {
      req.dfActor = buildGuestActor(req.dfGuestSession);
      return next();
    }

    if (!req.v2Auth?.accountId) {
      throw new AppError('Unauthorized', {
        status: 401,
        code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
      });
    }

    const routePath = String(req.route?.path || req.originalUrl || '');
    const topicId = req.params.topicId
      || (routePath.includes('/topics/') ? req.params.id : null);
    if (!topicId) {
      req.dfActor = {
        actorType: 'user',
        actorId: String(req.v2Auth.accountId),
        tenantId: String(req.v2Auth.accountId),
        permissions: req.v2Auth.permissions || {},
      };
      return next();
    }

    req.dfActor = await buildUserActor(req.v2Auth.accountId, req.v2Auth.accountId, topicId);
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = resolveDiscussFlowActor;
