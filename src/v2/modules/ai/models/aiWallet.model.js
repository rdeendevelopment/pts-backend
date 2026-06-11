const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const AiWalletSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, unique: true, index: true },
    balanceTokens: { type: Number, default: 0, min: 0 },
    reservedTokens: { type: Number, default: 0, min: 0 },
    lifetimeUsedTokens: { type: Number, default: 0, min: 0 },
    lifetimeCostEstimate: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'internal_tokens' },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_ai_token_wallets', timestamps: true }
);

async function ensureAiWalletIndexes() {
  const Model = getV2Model('PtsAiWallet', AiWalletSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  AiWalletSchema,
  ensureAiWalletIndexes,
  getAiWalletModel: () => getV2Model('PtsAiWallet', AiWalletSchema),
};
