const { AppError } = require('../../../kernel/errors');
const moduleErrorCodes = require('../errors/moduleErrorCodes');
const moduleRepository = require('../repositories/module.repository');

/**
 * Ensures a platform module (e.g. converse) is enabled in the module registry.
 * Independent of RBAC permissions — admin module toggle must block API access.
 */
function requireSystemModule(moduleKey) {
  const normalizedKey = String(moduleKey || '').trim().toLowerCase();

  return async function requireSystemModuleMiddleware(req, _res, next) {
    try {
      const moduleDoc = await moduleRepository.findByKey(normalizedKey);
      if (!moduleDoc || moduleDoc.isDeleted || moduleDoc.status !== 'active') {
        throw new AppError('This module is not enabled', {
          status: 403,
          code: moduleErrorCodes.MODULE_NOT_AVAILABLE,
          details: { moduleKey: normalizedKey },
        });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = requireSystemModule;
