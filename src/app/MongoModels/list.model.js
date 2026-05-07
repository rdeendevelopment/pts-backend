// Collection: lists
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const ListSchema = new Schema(
  {
    workspaceNodeId: { type: ObjId, required: true },
    userId:          { type: ObjId, ref: 'CoreUser', required: true },
    name:            { type: String, required: true, trim: true },
    isInbox:         { type: Boolean, default: false },
    color:           { type: String, default: null },
    icon:            { type: String, default: null },
    order:           { type: Number, default: 0 },
    wipLimit:        { type: Number, default: null },
    isArchived:      { type: Boolean, default: false },
    isActive:        { type: Boolean, default: true },
  },
  {
    collection: 'lists',
    timestamps: true,
  }
);

ListSchema.index({ workspaceNodeId: 1, userId: 1 });
ListSchema.index({ workspaceNodeId: 1, userId: 1, isInbox: 1 });
ListSchema.index({ workspaceNodeId: 1, userId: 1, order: 1 });

module.exports = mongoose.models.List || mongoose.model('List', ListSchema);
