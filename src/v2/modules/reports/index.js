const routes = require('./reports.routes');
const { ensureReportModuleIndexes } = require('./models');

async function bootstrapReportsModule() {
  await ensureReportModuleIndexes();
}

module.exports = {
  routes,
  ensureReportModuleIndexes,
  bootstrapReportsModule,
};
