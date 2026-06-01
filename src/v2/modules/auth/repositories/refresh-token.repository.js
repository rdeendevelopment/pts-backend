const { getRefreshTokenModel } = require('../models/refreshToken.model');

async function createRefreshToken(payload) {
  const RefreshToken = getRefreshTokenModel();
  return RefreshToken.create(payload);
}

async function findByTokenHash(tokenHash) {
  const RefreshToken = getRefreshTokenModel();
  return RefreshToken.findOne({ tokenHash, isDeleted: false }).exec();
}

async function markReplaced(tokenId, replacedByTokenId) {
  const RefreshToken = getRefreshTokenModel();
  return RefreshToken.updateOne(
    { _id: tokenId },
    {
      $set: {
        revokedAt: new Date(),
        revokedReason: 'rotated',
        replacedByTokenId,
      },
    }
  );
}

async function revokeById(tokenId, reason) {
  const RefreshToken = getRefreshTokenModel();
  return RefreshToken.updateOne(
    { _id: tokenId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

async function revokeFamily(familyId, reason) {
  const RefreshToken = getRefreshTokenModel();
  return RefreshToken.updateMany(
    { familyId, revokedAt: null, isDeleted: false },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );
}

module.exports = {
  createRefreshToken,
  findByTokenHash,
  markReplaced,
  revokeById,
  revokeFamily,
};
