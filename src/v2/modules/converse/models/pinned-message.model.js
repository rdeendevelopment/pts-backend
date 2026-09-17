const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const PinnedMessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    pinnedBy: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      required: true,
    },
  },
  {
    collection: 'converse_pinned_messages',
    timestamps: true,
  }
);

PinnedMessageSchema.index(
  { conversationId: 1, messageId: 1 },
  { unique: true }
);

PinnedMessageSchema.index({ conversationId: 1, createdAt: -1 });

async function ensurePinnedMessageIndexes() {
  const PinnedMessage = getV2Model('ConversePinnedMessage', PinnedMessageSchema);
  await PinnedMessage.createIndexes();
  return PinnedMessage;
}

module.exports = {
  PinnedMessageSchema,
  ensurePinnedMessageIndexes,
  getPinnedMessageModel: () => getV2Model('ConversePinnedMessage', PinnedMessageSchema),
};
