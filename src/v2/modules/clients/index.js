const routes = require('./clients.routes');
const { ensureClientIndexes } = require('./models');

module.exports = {
  routes,
  ensureClientIndexes,
};
