const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { CONVERSATION_TYPES } = require('../constants/converse.constants');

const LastMessageSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, default: null },
    text: { type: String, default: '' },
    type: { type: String, default: 'text' },
    senderId: { type: Schema.Types.ObjectId, default: null },
    senderName: { type: String, default: '' },
    createdAt: { type: Date, default: null },
  },
  { _id: false }
);

const ConversationSchema = new Schema(
  {
    type: { type: String, enum: Object.values(CONVERSATION_TYPES), required: true, index: true },
    title: { type: String, default: '', trim: true },
    avatar: { type: String, default: null },
    directKey: { type: String, default: null, index: true },
    memberCount: { type: Number, default: 0, min: 0 },
    adminUserIds: { type: [Schema.Types.ObjectId], default: [] },
    lastMessage: { type: LastMessageSchema, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsUser', default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_conversations',
    timestamps: true,
  }
);

ConversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { type: CONVERSATION_TYPES.DIRECT, isDeleted: false } }
);
ConversationSchema.index({ isDeleted: 1, updatedAt: -1 });

async function ensureConversationIndexes() {
  const Conversation = getV2Model('PtsConversation', ConversationSchema);
  await Conversation.createIndexes();
  return Conversation;
}

module.exports = {
  ConversationSchema,
  ensureConversationIndexes,
  getConversationModel: () => getV2Model('PtsConversation', ConversationSchema),
};
