const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  HANDOFF_SOURCE_TYPES,
  HANDOFF_TARGET_MODULES,
  HANDOFF_STATUS,
} = require('../constants/discussFlow.constants');

const DiscussFlowHandoffSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowWorkspace', required: true, index: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    sourceType: { type: String, enum: HANDOFF_SOURCE_TYPES, required: true, index: true },
    sourceId: { type: Schema.Types.ObjectId, required: true, index: true },
    targetModule: { type: String, enum: HANDOFF_TARGET_MODULES, required: true, index: true },
    targetId: { type: Schema.Types.ObjectId, default: null, index: true },
    status: { type: String, enum: HANDOFF_STATUS, default: 'pending', index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    processedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    error: { type: String, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_discuss_flow_handoffs', timestamps: true }
);

DiscussFlowHandoffSchema.index({ topicId: 1, status: 1, createdAt: -1 });
DiscussFlowHandoffSchema.index({ tenantId: 1, sourceType: 1, sourceId: 1, createdAt: -1 });
DiscussFlowHandoffSchema.index({ tenantId: 1, targetModule: 1, status: 1, createdAt: -1 });

async function ensureDiscussFlowHandoffIndexes() {
  const Model = getV2Model('PtsDiscussFlowHandoff', DiscussFlowHandoffSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowHandoffSchema,
  ensureDiscussFlowHandoffIndexes,
  getDiscussFlowHandoffModel: () => getV2Model('PtsDiscussFlowHandoff', DiscussFlowHandoffSchema),
};
