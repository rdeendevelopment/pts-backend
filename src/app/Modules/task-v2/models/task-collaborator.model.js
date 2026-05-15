// Collection: task_collaborators
// Users who have access to a specific task but are NOT project members.
// E.g. an external reviewer, a client contact, a contractor on a single task.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskCollaboratorSchema = new Schema(
  {
    taskId:      { type: ObjId, ref: 'Task', required: true, index: true },
    userId:      { type: ObjId, ref: 'CoreUser', required: true, index: true },
    // what the collaborator is allowed to do on this task
    accessType:  {
      type: String,
      enum: ['comment', 'review', 'edit'],
      default: 'comment',
    },
    addedBy:     { type: ObjId, default: null },
    addedAt:     { type: Date, default: Date.now },
    isActive:    { type: Boolean, default: true, index: true },
  },
  {
    collection: 'taskCollaboratorsV2',
    timestamps: true,
  }
);

TaskCollaboratorSchema.index({ taskId: 1, userId: 1 }, { unique: true });
TaskCollaboratorSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.models.TaskCollaborator || mongoose.model('TaskCollaborator', TaskCollaboratorSchema);
