const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TypingIndicatorSchema = new Schema(
  {
    conversationId: { type: ObjId, ref: 'Conversation', required: true },
    userId:         { type: ObjId, ref: 'CoreUser', required: true },
    userName:       { type: String, default: '' },
    startedAt:      { type: Date, default: () => new Date() },
  },
  { collection: 'typing_indicators', timestamps: false }
);

TypingIndicatorSchema.index({ conversationId: 1, startedAt: -1 });
TypingIndicatorSchema.index({ startedAt: 1 }, { expireAfterSeconds: 30 });
TypingIndicatorSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.TypingIndicator || mongoose.model('TypingIndicator', TypingIndicatorSchema);
