const { AppError } = require('../../../kernel/errors');
const aiErrorCodes = require('../errors/aiErrorCodes');
const aiEnv = require('../config/ai.env');
const { getAiWalletModel } = require('../models/aiWallet.model');
const { getAiUsageModel } = require('../models/aiUsage.model');
const { MODEL_COST_PER_1K } = require('../constants/ai-models.constants');
const { assertObjectId } = require('../../../kernel/validators/objectId');

function estimateCost(model, inputTokens, outputTokens) {
  const rates = MODEL_COST_PER_1K[model] || { input: 0.001, output: 0.002 };
  return ((inputTokens / 1000) * rates.input) + ((outputTokens / 1000) * rates.output);
}

async function ensureWallet(tenantId) {
  const normalized = assertObjectId(tenantId, 'tenantId');
  const Model = getAiWalletModel();
  let wallet = await Model.findOne({ tenantId: normalized, isDeleted: false });

  if (!wallet) {
    wallet = await Model.create({
      tenantId: normalized,
      balanceTokens: aiEnv.wallet.defaultTenantBalance,
      reservedTokens: 0,
    });
  }

  return wallet;
}

async function getAvailableBalance(tenantId) {
  const wallet = await ensureWallet(tenantId);
  return Math.max(0, wallet.balanceTokens - wallet.reservedTokens);
}

async function reserveTokens(tenantId, estimatedTokens) {
  const normalized = assertObjectId(tenantId, 'tenantId');
  const reserveAmount = Math.ceil(estimatedTokens * aiEnv.wallet.reserveBufferRatio);
  const Model = getAiWalletModel();
  const wallet = await ensureWallet(normalized);

  const available = wallet.balanceTokens - wallet.reservedTokens;
  if (available < reserveAmount) {
    throw new AppError('Insufficient AI token balance', {
      status: 402,
      code: aiErrorCodes.AI_INSUFFICIENT_TOKENS,
      details: {
        required: reserveAmount,
        available,
        balance: wallet.balanceTokens,
        reserved: wallet.reservedTokens,
      },
    });
  }

  wallet.reservedTokens += reserveAmount;
  await wallet.save();

  return { reserved: reserveAmount, walletId: wallet._id };
}

async function settleUsage({
  tenantId,
  reservedTokens,
  actualTokens,
  userId,
  module,
  action,
  model,
  jobId,
  inputTokens,
  outputTokens,
  executionMode,
  latencyMs,
  traceId,
}) {
  const normalized = assertObjectId(tenantId, 'tenantId');
  const Model = getAiWalletModel();
  const wallet = await ensureWallet(normalized);

  const costEstimate = estimateCost(model, inputTokens, outputTokens);

  wallet.reservedTokens = Math.max(0, wallet.reservedTokens - reservedTokens);
  wallet.balanceTokens = Math.max(0, wallet.balanceTokens - actualTokens);
  wallet.lifetimeUsedTokens += actualTokens;
  wallet.lifetimeCostEstimate += costEstimate;
  await wallet.save();

  const Usage = getAiUsageModel();
  await Usage.create({
    tenantId: normalized,
    userId: assertObjectId(userId, 'userId'),
    module,
    action,
    model,
    jobId: jobId || null,
    inputTokens,
    outputTokens,
    totalTokens: actualTokens,
    costEstimate,
    executionMode,
    latencyMs,
    traceId,
  });

  return { costEstimate, balanceRemaining: wallet.balanceTokens };
}

async function releaseReservation(tenantId, reservedTokens) {
  const normalized = assertObjectId(tenantId, 'tenantId');
  const Model = getAiWalletModel();
  const wallet = await ensureWallet(normalized);
  wallet.reservedTokens = Math.max(0, wallet.reservedTokens - reservedTokens);
  await wallet.save();
}

module.exports = {
  estimateCost,
  ensureWallet,
  getAvailableBalance,
  reserveTokens,
  settleUsage,
  releaseReservation,
};
