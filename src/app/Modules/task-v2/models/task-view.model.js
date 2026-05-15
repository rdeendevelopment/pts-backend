// Collection: task_views
// Saved views / filters per user per project (replaces personal list-as-view pattern).
// Users save filter combinations as named views: "My open tasks", "High priority this week", etc.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskViewSchema = new Schema(
  {
    userId:     { type: ObjId, ref: 'CoreUser', required: true, index: true },
    projectId:  { type: ObjId, ref: 'CoreProject', default: null, index: true },
    projectRef: {
      sourceId:   { type: Number, default: null },
      sourceType: { type: String, default: 'mongodb' },
    },
    name:       { type: String, required: true, trim: true },
    // viewType drives the layout component
    viewType:   { type: String, enum: ['board', 'list', 'calendar', 'timeline'], default: 'board' },
    // filters is a free JSON object — the frontend defines the filter shape
    filters: {
      assigneeIds:      { type: [ObjId], default: [] },
      statusIds:        { type: [ObjId], default: [] },
      priorities:       { type: [String], default: [] },
      labelIds:         { type: [ObjId], default: [] },
      dueDateFrom:      { type: Date, default: null },
      dueDateTo:        { type: Date, default: null },
      createdByMe:      { type: Boolean, default: null },
      assignedToMe:     { type: Boolean, default: null },
      hasDueDate:       { type: Boolean, default: null },
    },
    // groupBy determines column grouping on board view
    groupBy:    { type: String, enum: ['status', 'priority', 'assignee', 'label', 'dueDate'], default: 'status' },
    sortBy:     { type: String, default: 'order' },
    sortDir:    { type: String, enum: ['asc', 'desc'], default: 'asc' },
    isDefault:  { type: Boolean, default: false },
    isPinned:   { type: Boolean, default: false },
    isShared:   { type: Boolean, default: false },
    icon:       { type: String, default: null },
    color:      { type: String, default: null },
    order:      { type: Number, default: 0 },
  },
  {
    collection: 'taskViewsV2',
    timestamps: true,
  }
);

TaskViewSchema.index({ userId: 1, projectId: 1, order: 1 });
TaskViewSchema.index({ userId: 1, 'projectRef.sourceId': 1 });

module.exports = mongoose.models.TaskView || mongoose.model('TaskView', TaskViewSchema);
