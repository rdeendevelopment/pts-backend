const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

// Task-level collaborators stored in pts_task_collaborators.
const TaskCollaboratorSchema = new Schema(
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
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      required: true,
      index: true,
    },
    accessType: {
      type: String,
      enum: ['comment', 'review', 'edit'],
      default: 'comment',
    },
    isActive: { type: Boolean, default: true, index: true },
    addedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
  },
  {
    collection: 'pts_task_collaborators',
    timestamps: true,
  }
);

TaskCollaboratorSchema.index({ taskId: 1, userId: 1 }, { unique: true });

async function ensureTaskCollaboratorIndexes() {
  const TaskCollaborator = getV2Model('PtsTaskCollaborator', TaskCollaboratorSchema);
  await TaskCollaborator.createIndexes();
  return TaskCollaborator;
}

module.exports = {
  TaskCollaboratorSchema,
  ensureTaskCollaboratorIndexes,
  getTaskCollaboratorModel: () => getV2Model('PtsTaskCollaborator', TaskCollaboratorSchema),
};
