// Collection: task_labels
// Project-scoped labels/tags with colors. Replaces the free-text Task.tags[] array.
// The Task model will reference these by ObjectId in a new labelIds[] field.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskLabelSchema = new Schema(
  {
    projectId:  { type: ObjId, ref: 'CoreProject', default: null, index: true },
    projectRef: {
      sourceId:   { type: Number, default: null, index: true },
      sourceType: { type: String, default: 'mongodb' },
    },
    name:       { type: String, required: true, trim: true },
    color:      { type: String, default: '#64748B' },
    isActive:   { type: Boolean, default: true, index: true },
    createdBy:  { type: ObjId, default: null },
  },
  {
    collection: 'taskLabelsV2',
    timestamps: true,
  }
);

TaskLabelSchema.index({ projectId: 1, name: 1 });
TaskLabelSchema.index({ 'projectRef.sourceId': 1, isActive: 1 });

module.exports = mongoose.models.TaskLabel || mongoose.model('TaskLabel', TaskLabelSchema);
