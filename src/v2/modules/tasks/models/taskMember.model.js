const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { TASK_MEMBER_ROLES } = require('../constants/tasks.constants');

const TaskMemberSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: TASK_MEMBER_ROLES,
      default: 'member',
      index: true,
    },
    addedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    collection: 'pts_task_members',
    timestamps: true,
  }
);

TaskMemberSchema.index(
  { projectId: 1, userId: 1 },
  { unique: true, name: 'pts_task_members_project_user_unique' }
);

async function ensureTaskMemberIndexes() {
  const TaskMember = getV2Model('PtsTaskMember', TaskMemberSchema);
  await TaskMember.createIndexes();
  return TaskMember;
}

module.exports = {
  TaskMemberSchema,
  ensureTaskMemberIndexes,
  getTaskMemberModel: () => getV2Model('PtsTaskMember', TaskMemberSchema),
};
