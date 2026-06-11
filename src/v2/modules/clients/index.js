const routes = require('./clients.routes');
const { ensureClientIndexes, ensureClientContactIndexes } = require('./models');
const clientContactService = require('./services/clientContact.service');

async function ensureClientModuleIndexes() {
  await ensureClientIndexes();
  await ensureClientContactIndexes();
}

module.exports = {
  routes,
  ensureClientIndexes,
  ensureClientContactIndexes,
  ensureClientModuleIndexes,
  getClientSessionForAccount: clientContactService.getClientSessionForAccount,
  getClientContactSummaryForAccount: clientContactService.getClientContactSummaryForAccount,
};
