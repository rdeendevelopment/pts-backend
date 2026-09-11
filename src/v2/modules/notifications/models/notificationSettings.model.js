const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const NotificationSettingsSchema = new Schema({
  scope: { type: String, required: true, default: 'system', unique: true }, enabled: { type: Boolean, default: true },
  modules: { type: Schema.Types.Mixed, default: {} }, updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
  audit: { type: [Schema.Types.Mixed], default: [] },
}, { collection: 'pts_notification_settings', timestamps: true });
module.exports = {
  ensureNotificationSettingsIndexes: () => getV2Model('PtsNotificationSettings', NotificationSettingsSchema).createIndexes(),
  getNotificationSettingsModel: () => getV2Model('PtsNotificationSettings', NotificationSettingsSchema),
};
