const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const MessagePinSchema = new Schema(
  {
    conversationId: { type: ObjId, ref: 'Conversation', required: true },
    messageId:      { type: ObjId, ref: 'Message', required: true },
    messagePreview: { type: String, default: '' },
    pinnedBy:       { type: ObjId, ref: 'CoreUser', default: null },
    pinnedAt:       { type: Date, default: () => new Date() },
  },
  { collection: 'message_pins', timestamps: true }
);

MessagePinSchema.index({ conversationId: 1, pinnedAt: -1 });
MessagePinSchema.index({ messageId: 1 });
MessagePinSchema.index({ conversationId: 1, messageId: 1 }, { unique: true });

module.exports = mongoose.models.MessagePin || mongoose.model('MessagePin', MessagePinSchema);
