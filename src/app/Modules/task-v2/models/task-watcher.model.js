// Collection: task_watchers
// Users who follow a task for updates (not assignees, not collaborators).
// Lightweight — just userId + taskId. Notifications are driven by this collection.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskWatcherSchema = new Schema(
  {
    taskId:    { type: ObjId, ref: 'Task', required: true, index: true },
    projectId: { type: ObjId, ref: 'CoreProject', default: null, index: true },
    userId:    { type: ObjId, ref: 'CoreUser', required: true, index: true },
    addedAt:   { type: Date, default: Date.now },
  },
  {
    collection: 'taskWatchersV2',
    timestamps: true,
  }
);

TaskWatcherSchema.index({ taskId: 1, userId: 1 }, { unique: true });
TaskWatcherSchema.index({ userId: 1, taskId: 1 });

module.exports = mongoose.models.TaskWatcher || mongoose.model('TaskWatcher', TaskWatcherSchema);
