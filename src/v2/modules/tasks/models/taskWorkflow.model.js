const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { WORKFLOW_STATUSES } = require('../constants/tasks.constants');

const TaskWorkflowSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, default: 'Default Workflow' },
    isDefault: { type: Boolean, default: true, index: true },
    status: {
      type: String,
      enum: WORKFLOW_STATUSES,
      default: 'active',
      index: true,
    },
  },
  {
    collection: 'pts_task_workflows',
    timestamps: true,
  }
);

TaskWorkflowSchema.index({ projectId: 1, isDefault: 1 });

async function ensureTaskWorkflowIndexes() {
  const TaskWorkflow = getV2Model('PtsTaskWorkflow', TaskWorkflowSchema);
  await TaskWorkflow.createIndexes();
  return TaskWorkflow;
}

module.exports = {
  TaskWorkflowSchema,
  ensureTaskWorkflowIndexes,
  getTaskWorkflowModel: () => getV2Model('PtsTaskWorkflow', TaskWorkflowSchema),
};
