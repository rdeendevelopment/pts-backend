const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { TOPIC_MEMBER_ROLES } = require('../constants/discussFlow.constants');

const DiscussFlowTopicMemberSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    role: { type: String, enum: TOPIC_MEMBER_ROLES, default: 'contributor' },
    permissions: { type: Schema.Types.Mixed, default: {} },
    joinedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: null },
    notificationSettings: { type: Schema.Types.Mixed, default: {} },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_discuss_flow_topic_members', timestamps: true }
);

DiscussFlowTopicMemberSchema.index(
  { topicId: 1, accountId: 1 },
  { unique: true, name: 'pts_df_topic_members_unique', partialFilterExpression: { isDeleted: false } }
);

async function ensureDiscussFlowTopicMemberIndexes() {
  const Model = getV2Model('PtsDiscussFlowTopicMember', DiscussFlowTopicMemberSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowTopicMemberSchema,
  ensureDiscussFlowTopicMemberIndexes,
  getDiscussFlowTopicMemberModel: () => getV2Model('PtsDiscussFlowTopicMember', DiscussFlowTopicMemberSchema),
};
