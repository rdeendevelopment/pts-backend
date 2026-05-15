const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskNotificationV2Schema = new Schema(
  {
    recipientId: { type: ObjId, required: true, index: true },
    taskId:      { type: ObjId, required: true },
    projectRef:  { sourceId: { type: Number, default: null }, sourceType: { type: String, default: 'legacy' } },
    type: {
      type: String,
      required: true,
      enum: [
        'task_assigned', 'task_unassigned', 'task_mentioned', 'task_commented',
        'task_moved', 'task_completed', 'task_due_soon', 'task_overdue',
        'reviewer_assigned', 'task_created',
      ],
    },
    triggeredBy:   { type: ObjId, default: null },
    triggeredByName: { type: String, default: '' },
    taskTitle:     { type: String, default: '' },
    message:       { type: String, default: '' },
    isRead:        { type: Boolean, default: false, index: true },
    readAt:        { type: Date, default: null },
    /** Dedupes mention notifications per comment. */
    sourceCommentId: { type: ObjId, default: null, index: true },
  },
  {
    collection: 'taskNotificationsV2',
    timestamps: true,
  }
);

TaskNotificationV2Schema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
TaskNotificationV2Schema.index(
  { recipientId: 1, taskId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'task_assigned' } },
);

module.exports = mongoose.model('TaskNotificationV2', TaskNotificationV2Schema);
