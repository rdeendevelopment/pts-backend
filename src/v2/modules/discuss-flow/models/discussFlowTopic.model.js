const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { TOPIC_STATUS, TOPIC_PRIORITY } = require('../constants/discussFlow.constants');

const DiscussFlowTopicSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowWorkspace', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, default: null },
    status: { type: String, enum: TOPIC_STATUS, default: 'active', index: true },
    priority: { type: String, enum: TOPIC_PRIORITY, default: 'medium' },
    category: { type: String, default: null },
    tags: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    lastMessageAt: { type: Date, default: null },
    messageCount: { type: Number, default: 0, min: 0 },
    requirementCount: { type: Number, default: 0, min: 0 },
    questionCount: { type: Number, default: 0, min: 0 },
    decisionCount: { type: Number, default: 0, min: 0 },
    documentCount: { type: Number, default: 0, min: 0 },
    taskCount: { type: Number, default: 0, min: 0 },
    aiSummaryId: { type: Schema.Types.ObjectId, default: null },
    timelineEnabled: { type: Boolean, default: true },
    settings: { type: Schema.Types.Mixed, default: {} },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_discuss_flow_topics', timestamps: true }
);

DiscussFlowTopicSchema.index(
  { workspaceId: 1, slug: 1 },
  { unique: true, name: 'pts_df_topics_workspace_slug_unique', partialFilterExpression: { isDeleted: false } }
);
DiscussFlowTopicSchema.index({ tenantId: 1, status: 1, lastActivityAt: -1 });
DiscussFlowTopicSchema.index({ title: 'text', description: 'text', tags: 'text' }, { name: 'pts_df_topics_text' });

async function ensureDiscussFlowTopicIndexes() {
  const Model = getV2Model('PtsDiscussFlowTopic', DiscussFlowTopicSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowTopicSchema,
  ensureDiscussFlowTopicIndexes,
  getDiscussFlowTopicModel: () => getV2Model('PtsDiscussFlowTopic', DiscussFlowTopicSchema),
};
