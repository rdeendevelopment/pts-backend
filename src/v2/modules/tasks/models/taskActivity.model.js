const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const TaskActivitySchema = new Schema(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsTask',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    eventType: { type: String, required: true, trim: true, index: true },
    title: { type: String, default: null },
    description: { type: String, default: null },
    performedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    collection: 'pts_task_activities',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

TaskActivitySchema.index({ taskId: 1, createdAt: -1 });

async function ensureTaskActivityIndexes() {
  const TaskActivity = getV2Model('PtsTaskActivity', TaskActivitySchema);
  await TaskActivity.createIndexes();
  return TaskActivity;
}

module.exports = {
  TaskActivitySchema,
  ensureTaskActivityIndexes,
  getTaskActivityModel: () => getV2Model('PtsTaskActivity', TaskActivitySchema),
};
