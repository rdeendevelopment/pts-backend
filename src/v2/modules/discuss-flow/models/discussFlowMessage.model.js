const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  AUTHOR_TYPES,
  MESSAGE_TYPES,
  MESSAGE_SOURCES,
  MESSAGE_STATUS,
  AI_SUGGESTION_STATUS,
} = require('../constants/discussFlow.constants');

const DiscussFlowMessageSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    threadId: { type: Schema.Types.ObjectId, default: null, index: true },
    parentMessageId: { type: Schema.Types.ObjectId, default: null, index: true },
    replyToMessageId: { type: Schema.Types.ObjectId, default: null, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    authorType: { type: String, enum: AUTHOR_TYPES, default: 'account' },
    authorName: { type: String, default: null },
    messageType: { type: String, enum: MESSAGE_TYPES, default: 'message' },
    messageStatus: { type: String, enum: MESSAGE_STATUS, default: 'active', index: true },
    source: { type: String, enum: MESSAGE_SOURCES, default: 'manual' },
    sourceLabel: { type: String, default: null },
    importBatchId: { type: String, default: null, index: true },
    clientMessageId: { type: String, default: null, index: true },
    aiSuggestionStatus: { type: String, enum: AI_SUGGESTION_STATUS, default: 'none', index: true },
    content: { type: String, required: true },
    mentions: { type: [Schema.Types.ObjectId], default: [] },
    attachments: { type: [Schema.Types.Mixed], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_discuss_flow_messages', timestamps: true }
);

DiscussFlowMessageSchema.index({ topicId: 1, createdAt: -1 });
DiscussFlowMessageSchema.index({ content: 'text' }, { name: 'pts_df_messages_text' });

async function ensureDiscussFlowMessageIndexes() {
  const Model = getV2Model('PtsDiscussFlowMessage', DiscussFlowMessageSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowMessageSchema,
  ensureDiscussFlowMessageIndexes,
  getDiscussFlowMessageModel: () => getV2Model('PtsDiscussFlowMessage', DiscussFlowMessageSchema),
};
