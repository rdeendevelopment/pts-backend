const routes = require('./modules.routes');
const { ensureModuleIndexes } = require('./models');
const moduleService = require('./services/module.service');

module.exports = {
  routes,
  ensureModuleIndexes,
  seedSystemModules: moduleService.seedSystemModules,
  getActiveModulesForSession: moduleService.getActiveModulesForSession,
};
