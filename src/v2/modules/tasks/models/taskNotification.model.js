const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

// Phase 2: notification inbox routes wired in taskNotification.service.js
const TaskNotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'PtsUser', required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'PtsTask', default: null, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'PtsProject', default: null, index: true },
    activityId: { type: Schema.Types.ObjectId, default: null, index: true },
    entityType: { type: String, default: null, index: true },
    entityId: { type: String, default: null, index: true },
    actorId: { type: Schema.Types.ObjectId, default: null, index: true },
    actorName: { type: String, default: null },
    module: { type: String, default: null, index: true },
    priority: { type: String, default: 'normal', index: true },
    link: { type: String, default: null },
    type: { type: String, required: true, trim: true },
    title: { type: String, default: null },
    body: { type: String, default: null },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    collection: 'pts_task_notifications',
    timestamps: true,
  }
);

TaskNotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

async function ensureTaskNotificationIndexes() {
  const TaskNotification = getV2Model('PtsTaskNotification', TaskNotificationSchema);
  await TaskNotification.createIndexes();
  return TaskNotification;
}

module.exports = {
  TaskNotificationSchema,
  ensureTaskNotificationIndexes,
  getTaskNotificationModel: () => getV2Model('PtsTaskNotification', TaskNotificationSchema),
};
