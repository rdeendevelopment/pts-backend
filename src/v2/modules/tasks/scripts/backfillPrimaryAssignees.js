/* eslint-disable no-console */
const { connectV2Database, closeV2Database } = require('../../../database/connection');
const { getTaskModel } = require('../models/task.model');
const { getUserModel } = require('../../users/models/user.model');
const { getProjectAssignmentModel } = require('../../projects/models/projectAssignment.model');

const APPLY = process.argv.includes('--mode=apply') || process.argv.includes('--apply');
const BATCH_SIZE = Math.max(10, Number(process.env.TASK_PRIMARY_MIGRATION_BATCH_SIZE || 250));

async function inspectTask(task, User, Assignment) {
  const anomalies = [];
  const raw = Array.isArray(task.assignees) ? task.assignees : [];
  if (!raw.length) anomalies.push('no_assignee');
  if (raw.length > 1) anomalies.push('multiple_assignees');
  const valid = [];
  for (const assignee of raw) {
    if (!assignee?.userId) { anomalies.push('malformed_assignee'); continue; }
    const user = await User.findOne({ _id: assignee.userId, isDeleted: false }).select('_id').lean();
    if (!user) { anomalies.push('missing_or_deleted_user'); continue; }
    const assignment = await Assignment.findOne({
      projectId: task.projectId, userId: assignee.userId, status: 'active', isDeleted: false,
    }).select('_id').lean();
    if (!assignment) { anomalies.push('assignee_not_on_project'); continue; }
    valid.push(assignee.userId);
  }
  return { primaryAssigneeId: valid[0] || null, anomalies: [...new Set(anomalies)] };
}

async function run() {
  await connectV2Database();
  const Task = getTaskModel();
  const User = getUserModel();
  const Assignment = getProjectAssignmentModel();
  const summary = { mode: APPLY ? 'apply' : 'dry-run', scanned: 0, eligible: 0, updated: 0, skipped: 0, anomalies: {} };
  const cursor = Task.find({ primaryAssigneeId: null, isDeleted: false })
    .select('_id projectId assignees primaryAssigneeId').lean().cursor({ batchSize: BATCH_SIZE });
  for await (const task of cursor) {
    summary.scanned += 1;
    const result = await inspectTask(task, User, Assignment);
    for (const kind of result.anomalies) summary.anomalies[kind] = (summary.anomalies[kind] || 0) + 1;
    if (!result.primaryAssigneeId) { summary.skipped += 1; continue; }
    summary.eligible += 1;
    if (APPLY) {
      const update = await Task.updateOne(
        { _id: task._id, primaryAssigneeId: null },
        { $set: { primaryAssigneeId: result.primaryAssigneeId } }
      );
      summary.updated += update.modifiedCount || 0;
    }
  }
  console.log(JSON.stringify(summary, null, 2));
  await closeV2Database();
  return summary;
}

if (require.main === module) run().catch(async (err) => {
  console.error(err);
  try { await closeV2Database(); } catch (_) {}
  process.exitCode = 1;
});

module.exports = { inspectTask, run };
