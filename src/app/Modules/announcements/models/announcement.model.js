const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const ANNOUNCEMENT_TYPES = ['info', 'success', 'warning', 'maintenance', 'critical'];
const ANNOUNCEMENT_PRIORITIES = ['low', 'normal', 'high', 'critical'];
const AUDIENCE_TYPES = ['all', 'roles', 'users', 'client'];

const AnnouncementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    type: { type: String, enum: ANNOUNCEMENT_TYPES, default: 'info', index: true },
    priority: { type: String, enum: ANNOUNCEMENT_PRIORITIES, default: 'normal', index: true },
    isActive: { type: Boolean, default: true, index: true },
    isPinned: { type: Boolean, default: false, index: true },
    isDismissible: { type: Boolean, default: true },
    startAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null, index: true },
    audienceType: { type: String, enum: AUDIENCE_TYPES, default: 'all', index: true },
    roleIds: { type: [String], default: [] },
    userIds: { type: [String], default: [] },
    clientId: { type: String, default: null, index: true },
    createdBy: { type: ObjId, default: null },
    updatedBy: { type: ObjId, default: null },
    archivedAt: { type: Date, default: null, index: true },
  },
  { collection: 'announcements', timestamps: true, autoIndex: false }
);

AnnouncementSchema.index({ isActive: 1, archivedAt: 1, startAt: 1, expiresAt: 1 });
AnnouncementSchema.index({ audienceType: 1, roleIds: 1 });
AnnouncementSchema.index({ audienceType: 1, userIds: 1 });
AnnouncementSchema.index({ audienceType: 1, clientId: 1 });

const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', AnnouncementSchema);

async function ensureAnnouncementIndexes() {
  try {
    const indexes = await Announcement.collection.indexes();
    const invalidIndexes = indexes.filter((index) => {
      const keys = Object.keys(index.key || {});
      return keys.includes('roleIds') && keys.includes('userIds');
    });

    for (const index of invalidIndexes) {
      if (index.name && index.name !== '_id_') {
        await Announcement.collection.dropIndex(index.name);
      }
    }
  } catch (error) {
    if (error?.codeName !== 'NamespaceNotFound') throw error;
  }

  await Announcement.createIndexes();
}

module.exports = {
  Announcement,
  ensureAnnouncementIndexes,
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_PRIORITIES,
  AUDIENCE_TYPES,
};
