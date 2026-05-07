// Collection: notifications
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const NotificationSchema = new Schema(
  {
    userId:            { type: ObjId, ref: 'CoreUser', required: true },
    type: {
      type: String,
      required: true,
      enum: [
        'task_assigned', 'task_unassigned', 'task_updated',
        'member_assigned', 'member_unassigned',
        'task_commented', 'checklist_updated', 'task_mention',
        'task_due_soon', 'task_overdue', 'task_completed',
        'task_archived', 'task_restored', 'subtask_assigned',
        'timesheet_submitted', 'timesheet_approved', 'timesheet_rejected', 'timesheet_reminder',
        'comment_notification', 'mention_notification',
      ],
    },
    taskId:            { type: ObjId, ref: 'Task', default: null },
    taskTitle:         { type: String, default: '' },
    projectId:         { type: ObjId, ref: 'CoreProject', default: null },
    workspaceNodeId:   { type: ObjId, default: null },
    workspaceNodeName: { type: String, default: '' },
    triggeredBy:       { type: ObjId, ref: 'CoreUser', default: null },
    triggeredByName:   { type: String, default: '' },
    message:           { type: String, required: true },
    link:              { type: String, default: '' },
    isRead:            { type: Boolean, default: false },
    readAt:            { type: Date, default: null },
  },
  {
    collection: 'notifications',
    timestamps: true,
  }
);

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ taskId: 1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
