const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const NotificationPreferenceSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      required: true,
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    preference: {
      type: String,
      enum: ['all', 'mentions_replies', 'muted'],
      default: 'all',
    },
    mutedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'converse_notification_preferences',
    timestamps: true,
  }
);

NotificationPreferenceSchema.index(
  { userId: 1, conversationId: 1 },
  { unique: true }
);

async function ensureNotificationPreferenceIndexes() {
  const NotificationPreference = getV2Model('ConverseNotificationPreference', NotificationPreferenceSchema);
  await NotificationPreference.createIndexes();
  return NotificationPreference;
}

module.exports = {
  NotificationPreferenceSchema,
  ensureNotificationPreferenceIndexes,
  getNotificationPreferenceModel: () => getV2Model('ConverseNotificationPreference', NotificationPreferenceSchema),
};
