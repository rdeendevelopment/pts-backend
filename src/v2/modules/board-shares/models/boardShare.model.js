const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  BOARD_SHARE_ROLES,
  BOARD_SHARE_STATUSES,
} = require('../constants/boardShare.constants');

const BoardShareSchema = new Schema(
  {
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsClient',
      required: true,
      index: true,
    },
    projectIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'PtsProject' }],
      default: [],
    },
    role: {
      type: String,
      enum: BOARD_SHARE_ROLES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: BOARD_SHARE_STATUSES,
      default: 'active',
      index: true,
    },
    expiresAt: { type: Date, default: null, index: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      default: null,
      index: true,
    },
    revokedAt: { type: Date, default: null },
    revokedBy: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      default: null,
    },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_board_shares',
    timestamps: true,
  }
);

BoardShareSchema.index(
  { clientId: 1, status: 1 },
  { name: 'pts_board_shares_client_status' }
);

BoardShareSchema.index(
  { projectIds: 1, status: 1 },
  { name: 'pts_board_shares_projects_status' }
);

async function ensureBoardShareIndexes() {
  const BoardShare = getV2Model('PtsBoardShare', BoardShareSchema);
  await BoardShare.createIndexes();
  return BoardShare;
}

module.exports = {
  BoardShareSchema,
  ensureBoardShareIndexes,
  getBoardShareModel: () => getV2Model('PtsBoardShare', BoardShareSchema),
};
