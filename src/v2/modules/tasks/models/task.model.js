const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { TASK_STATUSES, TASK_PRIORITIES } = require('../constants/tasks.constants');

const AssigneeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'PtsUser', required: true },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
  },
  { _id: false }
);

const ChecklistItemSchema = new Schema(
  {
    text: { type: String, required: true },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const TaskAttachmentSchema = new Schema(
  {
    fileName: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true, trim: true },
    mimeType: { type: String, default: null },
    fileSize: { type: Number, default: 0, min: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const TaskSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsTaskWorkflow',
      required: true,
      index: true,
    },
    workflowStatusId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsTaskWorkflowStatus',
      required: true,
      index: true,
    },
    workflowOrder: { type: Number, default: 0 },
    taskNumber: { type: Number, default: null, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: 'none',
      index: true,
    },
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: 'active',
      index: true,
    },
    assignees: { type: [AssigneeSchema], default: [] },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'PtsUser', default: null },
    dueDate: { type: Date, default: null, index: true },
    startDate: { type: Date, default: null },
    estimatedMinutes: { type: Number, default: null, min: 0 },
    tags: { type: [String], default: [] },
    checklist: { type: [ChecklistItemSchema], default: [] },
    attachments: { type: [TaskAttachmentSchema], default: [] },
    commentCount: { type: Number, default: 0, min: 0 },
    completedAt: { type: Date, default: null },
    completedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_tasks',
    timestamps: true,
  }
);

TaskSchema.index({ projectId: 1, workflowStatusId: 1, status: 1 });
TaskSchema.index({ workflowStatusId: 1, workflowOrder: 1 });
TaskSchema.index({ 'assignees.userId': 1, status: 1 });

async function ensureTaskIndexes() {
  const Task = getV2Model('PtsTask', TaskSchema);
  await Task.createIndexes();
  return Task;
}

module.exports = {
  TaskSchema,
  ensureTaskIndexes,
  getTaskModel: () => getV2Model('PtsTask', TaskSchema),
};
