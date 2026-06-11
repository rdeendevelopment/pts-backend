const { sanitizeObject } = require('../helpers/promptSanitizer.helper');

function buildContext({ sourceModule, sourceId, actor, tenantId, context = {} }) {
  return sanitizeObject({
    tenantId: tenantId ? String(tenantId) : null,
    actorId: actor?.id || actor?.accountId || actor || null,
    sourceModule: sourceModule || null,
    sourceId: sourceId ? String(sourceId) : null,
    timestamp: new Date().toISOString(),
    ...context,
  });
}

module.exports = {
  buildContext,
};
