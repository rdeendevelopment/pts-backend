const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const AnnouncementReceiptSchema = new Schema(
  {
    announcementId: { type: ObjId, ref: 'Announcement', required: true, index: true },
    userId: { type: String, required: true, index: true },
    readAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
  },
  { collection: 'announcement_receipts', timestamps: true }
);

AnnouncementReceiptSchema.index({ announcementId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.AnnouncementReceipt || mongoose.model('AnnouncementReceipt', AnnouncementReceiptSchema);
