// Collection: task_comments
// Separated from the Task document to support pagination, threading, and reactions
// without loading the full task on every read.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const ReactionSchema = new Schema(
  {
    emoji:   { type: String, required: true },
    userId:  { type: ObjId, ref: 'CoreUser', required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TaskCommentSchema = new Schema(
  {
    taskId:         { type: ObjId, ref: 'Task', required: true, index: true },
    projectId:      { type: ObjId, ref: 'CoreProject', default: null, index: true },
    userId:         { type: ObjId, ref: 'CoreUser', required: true, index: true },
    // parentCommentId enables threaded replies
    parentCommentId: { type: ObjId, ref: 'TaskComment', default: null, index: true },
    text:           { type: String, required: true },
    mentions:       { type: [ObjId], ref: 'CoreUser', default: [] },
    reactions:      { type: [ReactionSchema], default: [] },
    attachments: [
      {
        name:            { type: String, required: true },
        url:             { type: String, required: true },
        publicId:        { type: String, default: null },
        storageProvider: { type: String, enum: ['cloudinary', 'local'], default: 'local' },
        mimeType:        { type: String, default: null },
        size:            { type: Number, default: 0 },
      },
    ],
    isEdited:       { type: Boolean, default: false },
    editedAt:       { type: Date, default: null },
    isDeleted:      { type: Boolean, default: false, index: true },
    deletedAt:      { type: Date, default: null },
    deletedBy:      { type: ObjId, ref: 'CoreUser', default: null },
    // legacy link: _id of embedded comment in old Task.comments array
    legacyCommentId: { type: String, default: null, index: true },
  },
  {
    collection: 'taskCommentsV2',
    timestamps: true,
  }
);

TaskCommentSchema.index({ taskId: 1, isDeleted: 1, createdAt: 1 });
TaskCommentSchema.index({ taskId: 1, parentCommentId: 1, isDeleted: 1 });
TaskCommentSchema.index({ 'mentions': 1 });

module.exports = mongoose.models.TaskComment || mongoose.model('TaskComment', TaskCommentSchema);
