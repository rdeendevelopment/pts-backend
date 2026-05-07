// Collection: task_placements
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskPlacementSchema = new Schema(
  {
    taskId:          { type: ObjId, ref: 'Task', required: true },
    userId:          { type: ObjId, ref: 'CoreUser', required: true },
    workspaceNodeId: { type: ObjId, required: true },
    listId:          { type: ObjId, ref: 'List', required: true },
    order:           { type: Number, default: 1024 },
    placedAt:        { type: Date, default: Date.now },
  },
  {
    collection: 'task_placements',
    timestamps: true,
  }
);

TaskPlacementSchema.index({ taskId: 1, userId: 1 });
TaskPlacementSchema.index({ userId: 1, listId: 1, order: 1 });
TaskPlacementSchema.index({ userId: 1, workspaceNodeId: 1 });
TaskPlacementSchema.index({ listId: 1, order: 1 });

module.exports = mongoose.models.TaskPlacement || mongoose.model('TaskPlacement', TaskPlacementSchema);
