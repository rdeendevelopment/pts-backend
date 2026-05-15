// Collection: task_workflow_statuses
// Each row is one column on the shared kanban board (Backlog, Todo, In Progress, …).
// All project members see the same statuses — NO userId scoping here.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskWorkflowStatusSchema = new Schema(
  {
    workflowId:  { type: ObjId, ref: 'TaskWorkflow', required: true, index: true },
    projectId:   { type: ObjId, ref: 'CoreProject', default: null, index: true },
    projectRef: {
      sourceId:   { type: Number, default: null, index: true },
      sourceType: { type: String, default: 'mongodb' },
    },
    name:        { type: String, required: true, trim: true },
    color:       { type: String, default: '#64748B' },
    icon:        { type: String, default: null },
    order:       { type: Number, default: 0, index: true },
    // terminal = tasks in this status count as "done" for reporting
    isTerminal:  { type: Boolean, default: false },
    // category drives visual styling: 'not_started' | 'active' | 'done' | 'cancelled'
    category:    { type: String, enum: ['not_started', 'active', 'done', 'cancelled'], default: 'not_started' },
    isArchived:  { type: Boolean, default: false, index: true },
    // legacy link: if this status was created from an old List document
    legacyListId: { type: ObjId, default: null, index: true },
  },
  {
    collection: 'taskWorkflowStatusesV2',
    timestamps: true,
  }
);

TaskWorkflowStatusSchema.index({ workflowId: 1, order: 1 });
TaskWorkflowStatusSchema.index({ workflowId: 1, isArchived: 1, order: 1 });
TaskWorkflowStatusSchema.index({ 'projectRef.sourceId': 1, isArchived: 1 });

module.exports = mongoose.models.TaskWorkflowStatus || mongoose.model('TaskWorkflowStatus', TaskWorkflowStatusSchema);
