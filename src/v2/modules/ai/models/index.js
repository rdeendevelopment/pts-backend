const { ensureAiJobIndexes } = require('./aiJob.model');
const { ensureAiUsageIndexes } = require('./aiUsage.model');
const { ensureAiLogIndexes } = require('./aiLog.model');
const { ensureAiWalletIndexes } = require('./aiWallet.model');
const { ensureAiActionIndexes } = require('./aiAction.model');

async function ensureAiModuleIndexes() {
  await ensureAiJobIndexes();
  await ensureAiUsageIndexes();
  await ensureAiLogIndexes();
  await ensureAiWalletIndexes();
  await ensureAiActionIndexes();
}

module.exports = {
  ensureAiModuleIndexes,
  ensureAiJobIndexes,
  ensureAiUsageIndexes,
  ensureAiLogIndexes,
  ensureAiWalletIndexes,
  ensureAiActionIndexes,
};
