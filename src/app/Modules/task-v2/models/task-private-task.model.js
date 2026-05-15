// Collection: task_private_tasks
// Personal notes / draft tasks inside a user's private workspace.
// These are intentionally simpler than project tasks:
//   - No assignees (it's yours alone)
//   - No workflow statuses (just a simple done/not-done)
//   - No project linkage
//   - Not billable, not reportable
//   - Admins CANNOT see or access these
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const PrivateChecklistItemSchema = new Schema(
  {
    text:        { type: String, required: true },
    isCompleted: { type: Boolean, default: false },
    order:       { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { _id: true }
);

const TaskPrivateTaskSchema = new Schema(
  {
    userId:      { type: ObjId, ref: 'CoreUser', required: true, index: true },
    listId:      { type: ObjId, ref: 'TaskPrivateList', required: true, index: true },
    folderId:    { type: ObjId, ref: 'TaskPrivateFolder', default: null, index: true },
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    notes:       { type: String, default: '' },
    priority:    { type: String, enum: ['none', 'low', 'medium', 'high', 'urgent'], default: 'none' },
    dueDate:     { type: Date, default: null },
    startDate:   { type: Date, default: null },
    tags:        { type: [String], default: [] },
    checklist:   { type: [PrivateChecklistItemSchema], default: [] },
    order:       { type: Number, default: 1024 },
    isDone:      { type: Boolean, default: false, index: true },
    completedAt: { type: Date, default: null },
    isArchived:  { type: Boolean, default: false, index: true },
    archivedAt:  { type: Date, default: null },
    deletedAt:   { type: Date, default: null },
  },
  {
    collection: 'taskPrivateTasksV2',
    timestamps: true,
  }
);

TaskPrivateTaskSchema.index({ userId: 1, listId: 1, deletedAt: 1, order: 1 });
TaskPrivateTaskSchema.index({ userId: 1, isDone: 1, dueDate: 1 });

module.exports = mongoose.models.TaskPrivateTask || mongoose.model('TaskPrivateTask', TaskPrivateTaskSchema);
