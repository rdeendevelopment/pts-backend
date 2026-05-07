// Collection: tasks
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const AssigneeSchema = new Schema(
  {
    userId:     { type: ObjId, ref: 'CoreUser', required: true },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: ObjId, ref: 'CoreUser', required: true },
  },
  { _id: true }
);

const ChecklistItemSchema = new Schema(
  {
    id:          { type: String, required: true },
    text:        { type: String, required: true },
    isCompleted: { type: Boolean, default: false },
    createdBy:   { type: ObjId, ref: 'CoreUser', required: true },
    completedBy: { type: ObjId, ref: 'CoreUser', default: null },
    completedAt: { type: Date, default: null },
    order:       { type: Number, default: 0 },
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: null },
  },
  { _id: true }
);

const AttachmentSchema = new Schema(
  {
    name:            { type: String, required: true },
    url:             { type: String, required: true },
    publicId:        { type: String, default: null },
    storageProvider: { type: String, enum: ['cloudinary', 'local'], default: 'cloudinary' },
    mimeType:        { type: String, default: null },
    size:            { type: Number, default: 0 },
    uploadedBy:      { type: ObjId, ref: 'CoreUser', required: true },
    uploadedAt:      { type: Date, default: Date.now },
    isDeleted:       { type: Boolean, default: false },
  },
  { _id: true }
);

const CommentSchema = new Schema(
  {
    id:        { type: String, required: true },
    userId:    { type: ObjId, ref: 'CoreUser', required: true },
    userName:  { type: String, default: '' },
    text:      { type: String, required: true },
    mentions:  { type: [ObjId], ref: 'CoreUser', default: [] },
    isEdited:  { type: Boolean, default: false },
    editedAt:  { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: ObjId, ref: 'CoreUser', default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const LogSchema = new Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'created', 'updated', 'assigned', 'unassigned',
        'moved', 'commented', 'comment_edited', 'comment_deleted',
        'checklist_added', 'checklist_completed', 'checklist_uncompleted',
        'attachment_added', 'attachment_deleted',
        'subtask_added', 'subtask_removed',
        'completed', 'reopened', 'archived', 'restored',
        'due_date_changed', 'priority_changed', 'tag_added', 'tag_removed',
      ],
    },
    performedBy: { type: ObjId, ref: 'CoreUser', required: true },
    meta:        { type: Object, default: {} },
    timestamp:   { type: Date, default: Date.now },
  },
  { _id: true }
);

const TaskSchema = new Schema(
  {
    workspaceNodeId:   { type: ObjId, required: true },
    workspaceNodeType: { type: String, enum: ['project', 'folder', 'subfolder'], required: true },
    projectId:         { type: ObjId, ref: 'CoreProject', default: null },
    projectRef: {
      sourceId:   { type: Number, default: null, index: true },
      sourceType: { type: String, default: 'mongodb' },
    },
    parentTaskId:      { type: ObjId, default: null },
    subTaskIds:        { type: [ObjId], default: [] },
    subTaskCount:      { type: Number, default: 0 },
    title:             { type: String, required: true, trim: true },
    description:       { type: String, default: '' },
    tags:              { type: [String], default: [] },
    priority:          { type: String, enum: ['none', 'low', 'medium', 'high', 'urgent'], default: 'none' },
    estimatedMinutes:  { type: Number, default: null },
    dueDate:           { type: Date, default: null },
    startDate:         { type: Date, default: null },
    reminderDate:      { type: Date, default: null },
    createdBy:         { type: ObjId, ref: 'CoreUser', required: true },
    assignees:         { type: [AssigneeSchema], default: [] },
    checklist:         { type: [ChecklistItemSchema], default: [] },
    attachments:       { type: [AttachmentSchema], default: [] },
    comments:          { type: [CommentSchema], default: [] },
    status:            { type: String, enum: ['active', 'completed', 'archived'], default: 'active' },
    completedAt:       { type: Date, default: null },
    completedBy:       { type: ObjId, ref: 'CoreUser', default: null },
    archivedAt:        { type: Date, default: null },
    archivedBy:        { type: ObjId, ref: 'CoreUser', default: null },
    logs:              { type: [LogSchema], default: [] },
  },
  {
    collection: 'tasks',
    timestamps: true,
  }
);

TaskSchema.index({ workspaceNodeId: 1, status: 1 });
TaskSchema.index({ 'assignees.userId': 1, status: 1 });
TaskSchema.index({ createdBy: 1 });
TaskSchema.index({ parentTaskId: 1 });
TaskSchema.index({ projectId: 1 });
TaskSchema.index({ 'projectRef.sourceId': 1, status: 1 });
TaskSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.models.Task || mongoose.model('Task', TaskSchema);
