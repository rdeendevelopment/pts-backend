const { info } = require('../../kernel/logger');
const { ensureAuthIndexes } = require('../../modules/auth');
const { ensureModuleIndexes, seedSystemModules } = require('../../modules/modules');
const { ensureRbacIndexes, seedRbac } = require('../../modules/rbac');
const { ensureUserIndexes } = require('../../modules/users');
const { ensureActivityModuleIndexes } = require('../../modules/activity');
const { ensureMigrationIndexes } = require('../models');
const { connectTargetForSeed } = require('../helpers/dualConnection.helper');

/**
 * Idempotent core seed for a fresh v2 database.
 * Does not migrate legacy business data.
 */
async function seedCore() {
  const connection = await connectTargetForSeed();

  await ensureMigrationIndexes(connection);
  await ensureAuthIndexes();
  await ensureModuleIndexes();
  const modulesSummary = await seedSystemModules();

  await ensureRbacIndexes();
  const rbacSummary = await seedRbac();

  await ensureUserIndexes();

  await ensureActivityModuleIndexes();
  const { seedWorkCategories } = require('../../modules/activity/services/workCategory.service');
  const categoriesSummary = await seedWorkCategories();

  const summary = {
    modules: modulesSummary,
    rbac: rbacSummary,
    workCategories: categoriesSummary,
  };

  info('PTS v2 migration seedCore completed', summary);
  return summary;
}

module.exports = {
  seedCore,
};
