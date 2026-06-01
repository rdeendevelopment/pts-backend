const routes = require('./auth.routes');
const authenticate = require('./middleware/authenticate');
const { ensureAuthIndexes } = require('./models');

module.exports = {
  routes,
  authenticate,
  ensureAuthIndexes,
};
