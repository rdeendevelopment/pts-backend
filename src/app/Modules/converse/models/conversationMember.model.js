const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const ConversationMemberSchema = new Schema(
  {
    conversationId:    { type: ObjId, ref: 'Conversation', required: true },
    userId:            { type: ObjId, ref: 'CoreUser', required: true },
    role:              { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    lastReadMessageId: { type: ObjId, ref: 'Message', default: null },
    lastReadAt:        { type: Date, default: null },
    unreadCount:       { type: Number, default: 0 },
    mentionCount:      { type: Number, default: 0 },
    isMuted:           { type: Boolean, default: false },
    isArchived:        { type: Boolean, default: false },
    isPinned:          { type: Boolean, default: false },
    isDeletedForMe:    { type: Boolean, default: false },
    joinedAt:          { type: Date, default: () => new Date() },
    leftAt:            { type: Date, default: null },
  },
  { collection: 'conversation_members', timestamps: true }
);

ConversationMemberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
ConversationMemberSchema.index({ userId: 1, isDeletedForMe: 1, lastReadAt: -1 });
ConversationMemberSchema.index({ conversationId: 1 });
ConversationMemberSchema.index({ userId: 1, isPinned: 1 });

module.exports = mongoose.models.ConversationMember || mongoose.model('ConversationMember', ConversationMemberSchema);
