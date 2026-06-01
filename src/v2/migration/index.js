/**
 * PTS v2 migration CLI entry helpers.
 * Business entity migration is implemented in later phases.
 */
module.exports = {
  seedAll: require('./seed/seedAll'),
  seedCore: require('./seed/seedCore'),
  seedSuperAdmin: require('./seed/seedSuperAdmin'),
  dualConnection: require('./helpers/dualConnection.helper'),
  models: require('./models'),
};
