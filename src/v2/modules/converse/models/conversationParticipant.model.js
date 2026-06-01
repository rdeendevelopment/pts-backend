const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { MEMBER_ROLES } = require('../constants/converse.constants');

const ConversationParticipantSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'PtsConversation', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'PtsUser', required: true, index: true },
    role: { type: String, enum: Object.values(MEMBER_ROLES), default: MEMBER_ROLES.MEMBER },
    lastReadMessageId: { type: Schema.Types.ObjectId, default: null },
    lastReadAt: { type: Date, default: null },
    unreadCount: { type: Number, default: 0, min: 0 },
    mentionCount: { type: Number, default: 0, min: 0 },
    isMuted: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    isDeletedForMe: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  {
    collection: 'pts_conversation_participants',
    timestamps: true,
  }
);

ConversationParticipantSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
ConversationParticipantSchema.index({ userId: 1, leftAt: 1, isDeletedForMe: 1 });

async function ensureConversationParticipantIndexes() {
  const Participant = getV2Model('PtsConversationParticipant', ConversationParticipantSchema);
  await Participant.createIndexes();
  return Participant;
}

module.exports = {
  ConversationParticipantSchema,
  ensureConversationParticipantIndexes,
  getConversationParticipantModel: () => getV2Model('PtsConversationParticipant', ConversationParticipantSchema),
};
