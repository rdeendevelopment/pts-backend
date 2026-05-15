// Collection: task_private_folders
// Top-level containers in a user's private workspace (Notes, Drafts, Ideas, etc.).
// Completely isolated from project tasks — admins CANNOT see these.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskPrivateFolderSchema = new Schema(
  {
    userId:    { type: ObjId, ref: 'CoreUser', required: true, index: true },
    name:      { type: String, required: true, trim: true },
    icon:      { type: String, default: null },
    color:     { type: String, default: null },
    order:     { type: Number, default: 0 },
    isActive:  { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'taskPrivateFoldersV2',
    timestamps: true,
  }
);

TaskPrivateFolderSchema.index({ userId: 1, deletedAt: 1, order: 1 });

module.exports = mongoose.models.TaskPrivateFolder || mongoose.model('TaskPrivateFolder', TaskPrivateFolderSchema);
