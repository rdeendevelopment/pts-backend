const routes = require('./users.routes');
const { ensureUserIndexes } = require('./models');
const userService = require('./services/user.service');

module.exports = {
  routes,
  ensureUserIndexes,
  getUserSummaryForAccount: userService.getUserSummaryForAccount,
};
