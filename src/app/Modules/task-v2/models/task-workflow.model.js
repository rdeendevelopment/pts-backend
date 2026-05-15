// Collection: task_workflows
// One workflow per project — defines the shared column set for the kanban board.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskWorkflowSchema = new Schema(
  {
    projectId:   { type: ObjId, ref: 'CoreProject', default: null, index: true },
    projectRef: {
      sourceId:   { type: Number, default: null, index: true },
      sourceType: { type: String, default: 'mongodb' },
    },
    name:        { type: String, default: 'Default Workflow', trim: true },
    isDefault:   { type: Boolean, default: true, index: true },
    isActive:    { type: Boolean, default: true, index: true },
    createdBy:   { type: ObjId, default: null },
    legacyId:    { type: String, default: null, index: true },
  },
  {
    collection: 'taskWorkflowsV2',
    timestamps: true,
  }
);

TaskWorkflowSchema.index({ projectId: 1, isDefault: 1 });
TaskWorkflowSchema.index({ 'projectRef.sourceId': 1, isDefault: 1 });

module.exports = mongoose.models.TaskWorkflow || mongoose.model('TaskWorkflow', TaskWorkflowSchema);
