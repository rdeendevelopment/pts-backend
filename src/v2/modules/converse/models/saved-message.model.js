const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const SavedMessageSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      required: true,
      index: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
  },
  {
    collection: 'converse_saved_messages',
    timestamps: true,
  }
);

SavedMessageSchema.index(
  { userId: 1, messageId: 1 },
  { unique: true }
);

SavedMessageSchema.index({ userId: 1, createdAt: -1 });

async function ensureSavedMessageIndexes() {
  const SavedMessage = getV2Model('ConverseSavedMessage', SavedMessageSchema);
  await SavedMessage.createIndexes();
  return SavedMessage;
}

module.exports = {
  SavedMessageSchema,
  ensureSavedMessageIndexes,
  getSavedMessageModel: () => getV2Model('ConverseSavedMessage', SavedMessageSchema),
};
