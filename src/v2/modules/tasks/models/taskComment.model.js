const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const CommentAttachmentSchema = new Schema(
  {
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    mimeType: { type: String, default: null },
    fileSize: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const TaskCommentSchema = new Schema(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsTask',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      required: true,
      index: true,
    },
    content: { type: String, required: true, trim: true },
    mentions: { type: [Schema.Types.ObjectId], ref: 'PtsUser', default: [] },
    attachments: { type: [CommentAttachmentSchema], default: [] },
    parentCommentId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsTaskComment',
      default: null,
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_task_comments',
    timestamps: true,
  }
);

TaskCommentSchema.index({ taskId: 1, isDeleted: 1, createdAt: 1 });

async function ensureTaskCommentIndexes() {
  const TaskComment = getV2Model('PtsTaskComment', TaskCommentSchema);
  await TaskComment.createIndexes();
  return TaskComment;
}

module.exports = {
  TaskCommentSchema,
  ensureTaskCommentIndexes,
  getTaskCommentModel: () => getV2Model('PtsTaskComment', TaskCommentSchema),
};
