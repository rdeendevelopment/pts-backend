const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { WORKSPACE_VISIBILITY, WORKSPACE_STATUS } = require('../constants/discussFlow.constants');

const DiscussFlowWorkspaceSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, default: null },
    icon: { type: String, default: null },
    visibility: { type: String, enum: WORKSPACE_VISIBILITY, default: 'team' },
    status: { type: String, enum: WORKSPACE_STATUS, default: 'active', index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    memberCount: { type: Number, default: 1, min: 0 },
    topicCount: { type: Number, default: 0, min: 0 },
    settings: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_discuss_flow_workspaces', timestamps: true }
);

DiscussFlowWorkspaceSchema.index(
  { tenantId: 1, slug: 1 },
  { unique: true, name: 'pts_df_workspaces_tenant_slug_unique', partialFilterExpression: { isDeleted: false } }
);
DiscussFlowWorkspaceSchema.index({ name: 'text', description: 'text' }, { name: 'pts_df_workspaces_text' });

async function ensureDiscussFlowWorkspaceIndexes() {
  const Model = getV2Model('PtsDiscussFlowWorkspace', DiscussFlowWorkspaceSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowWorkspaceSchema,
  ensureDiscussFlowWorkspaceIndexes,
  getDiscussFlowWorkspaceModel: () => getV2Model('PtsDiscussFlowWorkspace', DiscussFlowWorkspaceSchema),
};
