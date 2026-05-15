// tasksV2 — standalone task model for the V2 system.
// Does NOT share or reference the legacy 'tasks' collection.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const AssigneeSchema = new Schema(
  {
    userId:     { type: ObjId, required: true },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: ObjId, default: null },
    name:       { type: String, default: '' },
    email:      { type: String, default: '' },
  },
  { _id: false }
);

const ChecklistItemSchema = new Schema(
  {
    text:        { type: String, required: true },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    order:       { type: Number, default: 0 },
  },
  { _id: true }
);

const TaskAttachmentSchema = new Schema(
  {
    name:       { type: String, required: true, trim: true },
    url:        { type: String, required: true },
    mimeType:   { type: String, default: '' },
    size:       { type: Number, default: 0 },
    uploadedBy: { type: ObjId, ref: 'CoreUser', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const TaskV2Schema = new Schema(
  {
    // Project linkage — uses sourceId (legacy int PK) as the shared key
    projectId:  { type: ObjId, default: null, index: true },
    projectRef: {
      sourceId:   { type: Number, default: null, index: true },
      sourceType: { type: String, default: 'legacy' },
    },

    // Workflow position — one shared status for the whole team
    workflowStatusId: { type: ObjId, ref: 'TaskWorkflowStatusV2', default: null, index: true },
    workflowOrder:    { type: Number, default: 0 },

    // Sequential task number per project (PTS-XXX)
    taskNumber: { type: Number, default: null, index: true },

    // Content
    title:             { type: String, required: true, trim: true },
    description:       { type: String, default: '' },
    priority:          { type: String, enum: ['none', 'low', 'medium', 'high', 'urgent'], default: 'none' },
    tags:              { type: [String], default: [] },
    labelIds:          { type: [ObjId], default: [] },
    dueDate:           { type: Date, default: null },
    startDate:         { type: Date, default: null },
    estimatedMinutes:  { type: Number, default: null },

    // Collaborators
    createdBy:  { type: ObjId, required: true },
    assignees:  { type: [AssigneeSchema], default: [] },
    reviewerId: { type: ObjId, default: null },
    watchers:   { type: [ObjId], default: [] },

    // Checklist (embedded — lightweight)
    checklist: { type: [ChecklistItemSchema], default: [] },

    attachments: { type: [TaskAttachmentSchema], default: [] },

    // Counts (denormalized for performance)
    subTaskCount:  { type: Number, default: 0 },
    commentCount:  { type: Number, default: 0 },

    // Lifecycle
    status:      { type: String, enum: ['active', 'completed', 'archived'], default: 'active', index: true },
    completedAt: { type: Date, default: null },
    completedBy: { type: ObjId, default: null },
    archivedAt:  { type: Date, default: null },
  },
  {
    collection: 'tasksV2',
    timestamps: true,
  }
);

TaskV2Schema.index({ workflowStatusId: 1, workflowOrder: 1 });
TaskV2Schema.index({ 'projectRef.sourceId': 1, workflowStatusId: 1, status: 1 });
TaskV2Schema.index({ 'assignees.userId': 1, status: 1 });
TaskV2Schema.index({ createdBy: 1, status: 1 });
TaskV2Schema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.model('TaskV2', TaskV2Schema);
