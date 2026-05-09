const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const LastMessageSchema = new Schema(
  {
    _id:        { type: ObjId, default: null },
    text:       { type: String, default: '' },
    type:       { type: String, default: 'text' },
    senderId:   { type: ObjId, default: null },
    senderName: { type: String, default: '' },
    createdAt:  { type: Date, default: null },
  },
  { _id: false }
);

const ConversationSettingsSchema = new Schema(
  {
    allowMembersToInvite:    { type: Boolean, default: true },
    allowMembersToEditGroup: { type: Boolean, default: false },
  },
  { _id: false }
);

const ConversationSchema = new Schema(
  {
    type:        { type: String, enum: ['direct', 'group'], required: true },
    title:       { type: String, default: '' },
    avatar:      { type: String, default: '' },
    memberIds:   { type: [ObjId], ref: 'CoreUser', default: [] },
    memberCount: { type: Number, default: 0 },
    adminIds:    { type: [ObjId], ref: 'CoreUser', default: [] },
    directKey:   { type: String, default: null },
    lastMessage: { type: LastMessageSchema, default: null },
    settings:    { type: ConversationSettingsSchema, default: () => ({}) },
    createdBy:   { type: ObjId, ref: 'CoreUser', default: null },
    isDeleted:   { type: Boolean, default: false },
  },
  { collection: 'conversations', timestamps: true }
);

ConversationSchema.index({ memberIds: 1, 'lastMessage.createdAt': -1 });
ConversationSchema.index({ type: 1, updatedAt: -1 });
ConversationSchema.index({ createdBy: 1 });
ConversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { type: 'direct', directKey: { $type: 'string' } } }
);

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
