const SystemModule = require('../models/module.model');

function moduleEnabled(moduleKey) {
  return async function moduleEnabledMiddleware(req, res, next) {
    try {
      const mod = await SystemModule.findOne({ key: moduleKey }).lean();

      if (!mod) {
        return res.status(403).json({ success: false, message: `Module '${moduleKey}' is not available` });
      }

      if (!mod.enabled) {
        return res.status(403).json({ success: false, message: `Module '${moduleKey}' is currently disabled` });
      }

      return next();
    } catch (error) {
      console.error('[moduleEnabled] middleware error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };
}

module.exports = moduleEnabled;
