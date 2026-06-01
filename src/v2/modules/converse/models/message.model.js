const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { MESSAGE_TYPES } = require('../constants/converse.constants');

const AttachmentSchema = new Schema(
  {
    fileName: { type: String, default: '' },
    fileUrl: { type: String, default: '' },
    fileType: { type: String, default: null },
    fileSize: { type: Number, default: null },
  },
  { _id: false }
);

const ReplyToSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, default: null },
    text: { type: String, default: '' },
    senderId: { type: Schema.Types.ObjectId, default: null },
    senderName: { type: String, default: '' },
  },
  { _id: false }
);

const ReadReceiptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'PtsConversation', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'PtsUser', required: true, index: true },
    sequence: { type: Number, required: true, min: 1 },
    type: { type: String, enum: Object.values(MESSAGE_TYPES), default: MESSAGE_TYPES.TEXT },
    text: { type: String, default: '' },
    replyTo: { type: ReplyToSchema, default: null },
    attachments: { type: [AttachmentSchema], default: [] },
    readBy: { type: [ReadReceiptSchema], default: [] },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isDeletedForEveryone: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, default: null },
    deletedForUsers: { type: [Schema.Types.ObjectId], default: [] },
    schemaVersion: { type: Number, default: 1 },
  },
  {
    collection: 'pts_messages',
    timestamps: true,
  }
);

MessageSchema.index({ conversationId: 1, sequence: -1 });
MessageSchema.index({ conversationId: 1, isDeletedForEveryone: 1, sequence: -1 });

async function ensureMessageIndexes() {
  const Message = getV2Model('PtsMessage', MessageSchema);
  await Message.createIndexes();
  return Message;
}

module.exports = {
  MessageSchema,
  ensureMessageIndexes,
  getMessageModel: () => getV2Model('PtsMessage', MessageSchema),
};
