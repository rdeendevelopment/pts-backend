const { getTaskCommentModel } = require('../models/taskComment.model');

async function listByTaskId(taskId) {
  const TaskComment = getTaskCommentModel();
  return TaskComment.find({ taskId, isDeleted: false }).sort({ createdAt: 1 }).exec();
}

async function deleteByTaskId(taskId) {
  const TaskComment = getTaskCommentModel();
  return TaskComment.deleteMany({ taskId }).exec();
}

async function createComment(payload) {
  const TaskComment = getTaskCommentModel();
  return TaskComment.create(payload);
}

async function findMentionedTaskIds(userId, { limit = 500 } = {}) {
  const TaskComment = getTaskCommentModel();
  const rows = await TaskComment.find({
    mentions: userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('taskId')
    .lean();

  return [...new Set(rows.map((row) => row.taskId).filter(Boolean))];
}

async function listMentionsByUserId(userId, { skip = 0, limit = 50 } = {}) {
  const TaskComment = getTaskCommentModel();
  const query = { mentions: userId, isDeleted: false };

  const [items, total] = await Promise.all([
    TaskComment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    TaskComment.countDocuments(query),
  ]);

  return { items, total };
}

module.exports = {
  listByTaskId,
  createComment,
  findMentionedTaskIds,
  listMentionsByUserId,
  deleteByTaskId,
};
