const routes = require('./scheduler.routes');
const { ensureScheduledJobRunIndexes } = require('./models/scheduledJobRun.model');

async function ensureSchedulerModuleIndexes() {
  await ensureScheduledJobRunIndexes();
}

module.exports = {
  routes,
  ensureSchedulerModuleIndexes,
};
