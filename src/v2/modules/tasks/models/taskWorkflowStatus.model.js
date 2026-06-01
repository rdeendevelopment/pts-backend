const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { WORKFLOW_STATUSES, WORKFLOW_STATUS_CATEGORIES } = require('../constants/tasks.constants');

const TaskWorkflowStatusSchema = new Schema(
  {
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsTaskWorkflow',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    order: { type: Number, default: 0, index: true },
    category: {
      type: String,
      enum: WORKFLOW_STATUS_CATEGORIES,
      default: 'active',
    },
    color: { type: String, default: null },
    icon: { type: String, default: null },
    isTerminal: { type: Boolean, default: false },
    status: {
      type: String,
      enum: WORKFLOW_STATUSES,
      default: 'active',
      index: true,
    },
  },
  {
    collection: 'pts_task_workflow_statuses',
    timestamps: true,
  }
);

TaskWorkflowStatusSchema.index({ workflowId: 1, key: 1 }, { unique: true });
TaskWorkflowStatusSchema.index({ projectId: 1, order: 1 });

async function ensureTaskWorkflowStatusIndexes() {
  const TaskWorkflowStatus = getV2Model('PtsTaskWorkflowStatus', TaskWorkflowStatusSchema);
  await TaskWorkflowStatus.createIndexes();
  return TaskWorkflowStatus;
}

module.exports = {
  TaskWorkflowStatusSchema,
  ensureTaskWorkflowStatusIndexes,
  getTaskWorkflowStatusModel: () => getV2Model('PtsTaskWorkflowStatus', TaskWorkflowStatusSchema),
};
