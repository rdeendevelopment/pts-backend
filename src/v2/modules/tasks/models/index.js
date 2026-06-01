const { ensureTaskIndexes } = require('./task.model');
const { ensureTaskWorkflowIndexes } = require('./taskWorkflow.model');
const { ensureTaskWorkflowStatusIndexes } = require('./taskWorkflowStatus.model');
const { ensureTaskCommentIndexes } = require('./taskComment.model');
const { ensureTaskActivityIndexes } = require('./taskActivity.model');
const { ensureTaskMemberIndexes } = require('./taskMember.model');
const { ensureTaskCollaboratorIndexes } = require('./taskCollaborator.model');
const { ensureTaskNotificationIndexes } = require('./taskNotification.model');

async function ensureTaskModuleIndexes() {
  await ensureTaskIndexes();
  await ensureTaskWorkflowIndexes();
  await ensureTaskWorkflowStatusIndexes();
  await ensureTaskCommentIndexes();
  await ensureTaskActivityIndexes();
  await ensureTaskMemberIndexes();
  await ensureTaskCollaboratorIndexes();
  await ensureTaskNotificationIndexes();
}

module.exports = {
  ensureTaskModuleIndexes,
};
