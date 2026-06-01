const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const AnnouncementReceiptSchema = new Schema(
  {
    announcementId: { type: Schema.Types.ObjectId, ref: 'PtsAnnouncement', required: true, index: true },
    userId: { type: String, required: true, index: true },
    readAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
  },
  { collection: 'announcement_receipts', timestamps: true }
);

AnnouncementReceiptSchema.index({ announcementId: 1, userId: 1 }, { unique: true });

async function ensureAnnouncementReceiptIndexes() {
  const Receipt = getV2Model('PtsAnnouncementReceipt', AnnouncementReceiptSchema);
  await Receipt.createIndexes();
  return Receipt;
}

module.exports = {
  AnnouncementReceiptSchema,
  ensureAnnouncementReceiptIndexes,
  getAnnouncementReceiptModel: () => getV2Model('PtsAnnouncementReceipt', AnnouncementReceiptSchema),
};
