const routes = require('./activity.routes');
const { ensureActivityModuleIndexes } = require('./models');
const workCategoryService = require('./services/workCategory.service');

async function bootstrapActivityModule() {
  await ensureActivityModuleIndexes();
  await workCategoryService.seedWorkCategories();
}

module.exports = {
  routes,
  ensureActivityModuleIndexes,
  bootstrapActivityModule,
};
