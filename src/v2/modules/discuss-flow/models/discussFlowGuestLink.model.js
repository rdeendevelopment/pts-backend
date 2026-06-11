const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { GUEST_ROLES, GUEST_LINK_STATUS } = require('../constants/discussFlow.constants');

const DiscussFlowGuestLinkSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowWorkspace', required: true, index: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    role: { type: String, enum: GUEST_ROLES, required: true },
    permissions: { type: Schema.Types.Mixed, default: {} },
    tokenHash: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: null },
    status: { type: String, enum: GUEST_LINK_STATUS, default: 'active', index: true },
    expiresAt: { type: Date, default: null, index: true },
    maxUses: { type: Number, default: null, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    allowAnonymousName: { type: Boolean, default: true },
    requireName: { type: Boolean, default: false },
    requireEmail: { type: Boolean, default: false },
    passwordHash: { type: String, default: null },
    passwordEnabled: { type: Boolean, default: false },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_discuss_flow_guest_links', timestamps: true }
);

DiscussFlowGuestLinkSchema.index({ topicId: 1, status: 1, createdAt: -1 });

async function ensureDiscussFlowGuestLinkIndexes() {
  const Model = getV2Model('PtsDiscussFlowGuestLink', DiscussFlowGuestLinkSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowGuestLinkSchema,
  ensureDiscussFlowGuestLinkIndexes,
  getDiscussFlowGuestLinkModel: () => getV2Model('PtsDiscussFlowGuestLink', DiscussFlowGuestLinkSchema),
};
