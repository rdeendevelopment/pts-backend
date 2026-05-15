// Collection: task_private_lists
// Lists inside a private folder (e.g. "Draft Tasks" inside the "Drafts" folder).
// Only the owning user can access these — no sharing, no project linkage.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskPrivateListSchema = new Schema(
  {
    userId:    { type: ObjId, ref: 'CoreUser', required: true, index: true },
    folderId:  { type: ObjId, ref: 'TaskPrivateFolder', required: true, index: true },
    name:      { type: String, required: true, trim: true },
    icon:      { type: String, default: null },
    color:     { type: String, default: null },
    order:     { type: Number, default: 0 },
    isActive:  { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'taskPrivateListsV2',
    timestamps: true,
  }
);

TaskPrivateListSchema.index({ userId: 1, folderId: 1, deletedAt: 1, order: 1 });

module.exports = mongoose.models.TaskPrivateList || mongoose.model('TaskPrivateList', TaskPrivateListSchema);
