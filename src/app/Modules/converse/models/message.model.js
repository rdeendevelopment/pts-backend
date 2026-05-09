const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const ReplyToSchema = new Schema(
  {
    messageId:  { type: ObjId, default: null },
    text:       { type: String, default: '' },
    senderId:   { type: ObjId, default: null },
    senderName: { type: String, default: '' },
  },
  { _id: false }
);

const ForwardedFromSchema = new Schema(
  {
    messageId:      { type: ObjId, default: null },
    conversationId: { type: ObjId, default: null },
    senderId:       { type: ObjId, default: null },
  },
  { _id: false }
);

const AttachmentSchema = new Schema(
  {
    fileName:   { type: String, default: '' },
    mimeType:   { type: String, default: '' },
    size:       { type: Number, default: 0 },
    storageKey: { type: String, default: '' },
    provider:   { type: String, default: '' },
    url:        { type: String, default: '' },
  },
  { _id: false }
);

const ReactionSchema = new Schema(
  {
    emoji:   { type: String, required: true },
    userIds: { type: [ObjId], default: [] },
  },
  { _id: false }
);

const ReadBySchema = new Schema(
  {
    userId: { type: ObjId, required: true },
    readAt: { type: Date, required: true },
  },
  { _id: false }
);

const MessageSchema = new Schema(
  {
    conversationId:        { type: ObjId, ref: 'Conversation', required: true },
    senderId:              { type: ObjId, ref: 'CoreUser', required: true },
    sequence:              { type: Number, required: true },
    type:                  { type: String, enum: ['text', 'image', 'file', 'system'], default: 'text' },
    text:                  { type: String, default: '' },
    replyTo:               { type: ReplyToSchema, default: null },
    forwardedFrom:         { type: ForwardedFromSchema, default: null },
    attachments:           { type: [AttachmentSchema], default: [] },
    reactions:             { type: [ReactionSchema], default: [] },
    readBy:                { type: [ReadBySchema], default: [] },
    deletedForUsers:       { type: [ObjId], ref: 'CoreUser', default: [] },
    isEdited:              { type: Boolean, default: false },
    editedAt:              { type: Date, default: null },
    isDeletedForEveryone:  { type: Boolean, default: false },
    deletedAt:             { type: Date, default: null },
    deletedBy:             { type: ObjId, ref: 'CoreUser', default: null },
  },
  { collection: 'messages', timestamps: true }
);

MessageSchema.index({ conversationId: 1, sequence: -1 });
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, createdAt: -1 });
MessageSchema.index({ text: 'text' });

module.exports = mongoose.models.Message || mongoose.model('Message', MessageSchema);
