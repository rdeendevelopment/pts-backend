// Collection: task_activities
// Immutable audit log for a task. Replaces embedded Task.logs[].
// Kept separate so the activity feed can be queried across tasks per project.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const ACTIVITY_ACTIONS = [
  'created', 'updated', 'title_changed', 'description_changed',
  'status_changed', 'priority_changed', 'due_date_changed', 'start_date_changed',
  'assigned', 'unassigned', 'reviewer_set', 'reviewer_removed',
  'watcher_added', 'watcher_removed',
  'comment_added', 'comment_edited', 'comment_deleted',
  'checklist_added', 'checklist_item_completed', 'checklist_item_uncompleted', 'checklist_removed',
  'attachment_added', 'attachment_deleted',
  'subtask_added', 'subtask_removed',
  'label_added', 'label_removed',
  'completed', 'reopened', 'archived', 'restored',
  'moved',           // workflow status changed (the main board move)
  'collaborator_added', 'collaborator_removed',
];

const TaskActivitySchema = new Schema(
  {
    taskId:      { type: ObjId, ref: 'Task', required: true, index: true },
    projectId:   { type: ObjId, ref: 'CoreProject', default: null, index: true },
    projectRef: {
      sourceId:   { type: Number, default: null, index: true },
      sourceType: { type: String, default: 'mongodb' },
    },
    action:      { type: String, enum: ACTIVITY_ACTIONS, required: true, index: true },
    performedBy: { type: ObjId, required: true, index: true },
    // meta stores before/after values and any additional context
    meta:        { type: Schema.Types.Mixed, default: {} },
  },
  {
    collection: 'taskActivitiesV2',
    timestamps: true,
  }
);

// Project-level activity feed (sorted by most recent)
TaskActivitySchema.index({ projectId: 1, createdAt: -1 });
TaskActivitySchema.index({ 'projectRef.sourceId': 1, createdAt: -1 });
// Per-task history
TaskActivitySchema.index({ taskId: 1, createdAt: 1 });
// User activity across all tasks
TaskActivitySchema.index({ performedBy: 1, createdAt: -1 });

module.exports = mongoose.models.TaskActivity || mongoose.model('TaskActivity', TaskActivitySchema);
