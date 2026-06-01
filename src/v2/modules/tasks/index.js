const routes = require('./tasks.routes');
const { ensureTaskModuleIndexes } = require('./models');

module.exports = {
  routes,
  ensureTaskModuleIndexes,
};
