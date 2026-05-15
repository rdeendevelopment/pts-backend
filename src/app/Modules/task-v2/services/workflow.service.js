const { TaskWorkflowV2: TaskWorkflow, TaskWorkflowStatusV2: TaskWorkflowStatus } = require('../models');
const { CoreProject } = require('../../../MongoModels');

// The canonical default workflow every new project receives.
const DEFAULT_STATUSES = [
  { name: 'Backlog',     color: '#94A3B8', icon: 'ri-inbox-line',              order: 0,    isTerminal: false, category: 'not_started' },
  { name: 'Todo',        color: '#3B82F6', icon: 'ri-checkbox-blank-circle-line', order: 1024, isTerminal: false, category: 'not_started' },
  { name: 'In Progress', color: '#F59E0B', icon: 'ri-loader-4-line',            order: 2048, isTerminal: false, category: 'active'      },
  { name: 'Review',      color: '#8B5CF6', icon: 'ri-eye-line',                 order: 3072, isTerminal: false, category: 'active'      },
  { name: 'QA',          color: '#EC4899', icon: 'ri-bug-line',                 order: 4096, isTerminal: false, category: 'active'      },
  { name: 'Done',        color: '#10B981', icon: 'ri-checkbox-circle-line',     order: 5120, isTerminal: true,  category: 'done'        },
  { name: 'Archived',    color: '#64748B', icon: 'ri-archive-line',             order: 6144, isTerminal: false, category: 'cancelled'   },
];

function serviceError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function getOrCreateProjectWorkflow(projectSourceId) {
  if (!projectSourceId) throw serviceError('projectSourceId is required');

  const sourceId = Number(projectSourceId);
  if (!Number.isFinite(sourceId)) throw serviceError('projectSourceId must be a number');

  // Return existing workflow if already provisioned
  const existing = await TaskWorkflow.findOne({
    'projectRef.sourceId': sourceId,
    isDefault: true,
    isActive: true,
  }).lean();

  if (existing) {
    const statuses = await getWorkflowStatuses(existing._id);
    return { workflow: existing, statuses };
  }

  // Create from default template
  const project = await CoreProject.findOne({ legacyId: sourceId }, { _id: 1, title: 1 }).lean();

  const workflow = await TaskWorkflow.create({
    projectId:  project?._id || null,
    projectRef: { sourceId: sourceId, sourceType: 'mongodb' },
    name:       'Default Workflow',
    isDefault:  true,
    isActive:   true,
  });

  const statuses = await Promise.all(
    DEFAULT_STATUSES.map((s) => TaskWorkflowStatus.create({
      workflowId:  workflow._id,
      projectId:   project?._id || null,
      projectRef:  { sourceId: sourceId, sourceType: 'mongodb' },
      ...s,
    }))
  );

  return { workflow: workflow.toObject(), statuses: statuses.map((s) => s.toObject()) };
}

async function getWorkflowForProject(projectSourceId) {
  const sourceId = Number(projectSourceId);
  const workflow = await TaskWorkflow.findOne({
    'projectRef.sourceId': sourceId,
    isDefault: true,
    isActive: true,
  }).lean();

  if (!workflow) throw serviceError('Workflow not found for this project — run migration first', 404);

  const statuses = await getWorkflowStatuses(workflow._id);
  return { workflow, statuses };
}

async function getWorkflowStatuses(workflowId) {
  return TaskWorkflowStatus.find({
    workflowId,
    isArchived: false,
  }).sort({ order: 1 }).lean();
}

async function addStatus(projectSourceId, actorUserId, data) {
  const { workflow } = await getWorkflowForProject(projectSourceId);

  const { name, color, icon, category = 'active' } = data;
  if (!name || !String(name).trim()) throw serviceError('name is required');

  const duplicate = await TaskWorkflowStatus.findOne({
    workflowId: workflow._id,
    name: { $regex: new RegExp(`^${String(name).trim()}$`, 'i') },
    isArchived: false,
  }).lean();
  if (duplicate) throw serviceError('A status with this name already exists', 409);

  // Place at the end (before Archived)
  const last = await TaskWorkflowStatus.findOne({ workflowId: workflow._id, isArchived: false })
    .sort({ order: -1 }).lean();
  const order = last ? Number(last.order) + 1024 : 1024;

  const status = await TaskWorkflowStatus.create({
    workflowId:  workflow._id,
    projectId:   workflow.projectId,
    projectRef:  { sourceId: workflow.projectRef.sourceId, sourceType: workflow.projectRef.sourceType },
    name:        String(name).trim(),
    color:       color || '#64748B',
    icon:        icon || null,
    order,
    isTerminal:  Boolean(data.isTerminal),
    category,
  });

  return status.toObject();
}

async function updateStatus(statusId, data) {
  const status = await TaskWorkflowStatus.findOne({ _id: statusId, isArchived: false });
  if (!status) throw serviceError('Status not found', 404);

  if (data.name !== undefined) {
    const trimmed = String(data.name).trim();
    if (!trimmed) throw serviceError('name cannot be empty');
    const duplicate = await TaskWorkflowStatus.findOne({
      _id: { $ne: statusId },
      workflowId: status.workflowId,
      name: { $regex: new RegExp(`^${trimmed}$`, 'i') },
      isArchived: false,
    }).lean();
    if (duplicate) throw serviceError('A status with this name already exists', 409);
    status.name = trimmed;
  }

  if (data.color !== undefined) status.color = data.color;
  if (data.icon !== undefined) status.icon = data.icon;
  if (data.category !== undefined) status.category = data.category;
  if (data.isTerminal !== undefined) status.isTerminal = Boolean(data.isTerminal);

  await status.save();
  return status.toObject();
}

async function reorderStatuses(projectSourceId, updates) {
  if (!Array.isArray(updates) || !updates.length) throw serviceError('updates must be a non-empty array');

  const { workflow } = await getWorkflowForProject(projectSourceId);

  const activeRows = await TaskWorkflowStatus.find({
    workflowId: workflow._id,
    isArchived: false,
  }).select('_id').lean();
  const validIds = new Set(activeRows.map((r) => String(r._id)));

  for (const u of updates) {
    const sid = u?.statusId != null ? String(u.statusId) : '';
    const ord = Number(u?.order);
    if (!sid || !validIds.has(sid)) {
      throw serviceError('Invalid status in reorder payload', 400);
    }
    if (!Number.isFinite(ord)) {
      throw serviceError('Invalid order in reorder payload', 400);
    }
  }

  for (const { statusId, order } of updates) {
    await TaskWorkflowStatus.updateOne(
      { _id: statusId, workflowId: workflow._id },
      { $set: { order: Number(order) } },
    );
  }

  return getWorkflowStatuses(workflow._id);
}

async function archiveStatus(statusId, replacementStatusId) {
  const status = await TaskWorkflowStatus.findOne({ _id: statusId });
  if (!status) throw serviceError('Status not found', 404);
  if (!replacementStatusId) throw serviceError('replacementStatusId is required — move tasks first', 400);

  const replacement = await TaskWorkflowStatus.findOne({
    _id: replacementStatusId,
    workflowId: status.workflowId,
    isArchived: false,
  }).lean();
  if (!replacement) throw serviceError('Replacement status not found or already archived', 404);

  // Move all tasks in this status to the replacement
  const { TaskV2 } = require('../models');
  await TaskV2.updateMany(
    { workflowStatusId: status._id },
    { $set: { workflowStatusId: replacement._id } }
  );

  status.isArchived = true;
  await status.save();

  return status.toObject();
}

module.exports = {
  getOrCreateProjectWorkflow,
  getWorkflowForProject,
  getWorkflowStatuses,
  addStatus,
  updateStatus,
  reorderStatuses,
  archiveStatus,
  DEFAULT_STATUSES,
};
