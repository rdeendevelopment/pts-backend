const { Schema, Types } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const RefreshTokenSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    familyId: {
      type: String,
      required: true,
      index: true,
    },
    replacedByTokenId: {
      type: Types.ObjectId,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: { type: Date, default: null, index: true },
    revokedReason: { type: String, default: null },
    createdByIp: { type: String, default: null },
    userAgent: { type: String, default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_refresh_tokens',
    timestamps: true,
  }
);

RefreshTokenSchema.index({ accountId: 1, familyId: 1 });
RefreshTokenSchema.index({ familyId: 1, revokedAt: 1 });

async function ensureRefreshTokenIndexes() {
  const RefreshToken = getV2Model('PtsRefreshToken', RefreshTokenSchema);
  await RefreshToken.createIndexes();
  return RefreshToken;
}

module.exports = {
  RefreshTokenSchema,
  ensureRefreshTokenIndexes,
  getRefreshTokenModel: () => getV2Model('PtsRefreshToken', RefreshTokenSchema),
};
