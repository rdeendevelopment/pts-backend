const { authenticate, requireModule } = require('./auth');

module.exports = [
  authenticate,
  requireModule('settings'),
];
