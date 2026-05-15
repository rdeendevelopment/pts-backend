// task-shim.controller.js
//
// When shared_workflows module is enabled (req.useSharedWorkflows === true),
// intercepts the existing task-system API calls and translates them to v2 logic.
// When disabled, falls through to the original v1 controller transparently.
//
// Translation contract:
//   v1 "listId"    ↔  v2 "workflowStatusId"
//   v1 "nodeId"    ↔  v2 "projectSourceId"  (resolved via workspace_nodes)
//   Board response shape { [listId]: Task[] } is preserved identically.

const taskV1 = require('./task.controller');
const listV1 = require('./list.controller');

const boardServiceV2    = require('../../Modules/task-v2/services/board.service');
const workflowServiceV2 = require('../../Modules/task-v2/services/workflow.service');
const WorkspaceNode     = require('../../MongoModels/workspace_node.model');

// ── Helpers ───────────────────────────────────────────────────────────────────

function actorId(req) {
  return req.auth?.user?._id || req.user?._id || req.auth?.user?.id || req.user?.id;
}

async function resolveProjectSourceId(nodeId) {
  if (!nodeId) return null;
  const node = await WorkspaceNode.findOne({ _id: nodeId, deletedAt: null }).lean();
  if (!node) return null;

  if (node.projectRef?.sourceId) return Number(node.projectRef.sourceId);
  if (node.rootProjectId) {
    const root = await WorkspaceNode.findOne({ _id: node.rootProjectId, deletedAt: null }).lean();
    return root?.projectRef?.sourceId ? Number(root.projectRef.sourceId) : null;
  }
  return null;
}

// Format a workflow status so the frontend treats it exactly like a v1 List.
function statusToList(status) {
  return {
    _id:             String(status._id),
    id:              String(status._id),
    workspaceNodeId: null,
    userId:          null,
    name:            status.name,
    isInbox:         status.order === 0 || status.name.toLowerCase() === 'backlog',
    color:           status.color || null,
    icon:            status.icon || null,
    order:           status.order,
    wipLimit:        null,
    isArchived:      Boolean(status.isArchived),
    isActive:        true,
    // v2 metadata the frontend can use for enhanced UX
    isWorkflowStatus: true,
    category:         status.category,
    isTerminal:       status.isTerminal,
  };
}

// ── List shims ────────────────────────────────────────────────────────────────

exports.getLists = async (req, res) => {
  if (!req.useSharedWorkflows) return listV1.getLists(req, res);

  try {
    const projectSourceId = await resolveProjectSourceId(req.params.nodeId);
    if (!projectSourceId) return listV1.getLists(req, res);

    const { statuses } = await workflowServiceV2.getOrCreateProjectWorkflow(projectSourceId);
    res.json({ success: true, data: statuses.map(statusToList) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// In v2, lists are workflow statuses — creating a list creates a new status column.
exports.createList = async (req, res) => {
  if (!req.useSharedWorkflows) return listV1.createList(req, res);

  try {
    const projectSourceId = await resolveProjectSourceId(req.params.nodeId);
    if (!projectSourceId) return listV1.createList(req, res);

    const status = await workflowServiceV2.addStatus(projectSourceId, actorId(req), req.body);
    res.status(201).json({ success: true, data: statusToList(status) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.renameList = async (req, res) => {
  if (!req.useSharedWorkflows) return listV1.renameList(req, res);

  try {
    const status = await workflowServiceV2.updateStatus(req.params.id, { name: req.body.name });
    res.json({ success: true, data: statusToList(status) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.deleteList = async (req, res) => {
  if (!req.useSharedWorkflows) return listV1.deleteList(req, res);
  // Deleting a workflow status requires a replacement — not a simple DELETE.
  // Return a clear error so the frontend can ask the user to pick a replacement.
  res.status(400).json({
    success: false,
    message: 'Shared workflow statuses cannot be deleted directly. Use the Archive Status API and provide a replacement status.',
  });
};

exports.reorderLists = async (req, res) => {
  if (!req.useSharedWorkflows) return listV1.reorderLists(req, res);

  try {
    const projectSourceId = await resolveProjectSourceId(req.params.nodeId);
    if (!projectSourceId) return listV1.reorderLists(req, res);

    const statuses = await workflowServiceV2.reorderStatuses(projectSourceId, req.body.updates);
    res.json({ success: true, data: statuses.map(statusToList) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.archiveList = async (req, res) => {
  if (!req.useSharedWorkflows) return listV1.archiveList(req, res);
  // Surface archive-status endpoint for v2
  res.status(400).json({
    success: false,
    message: 'Use PUT /task-v2/statuses/:statusId/archive with replacementStatusId to archive a workflow status.',
  });
};

// ── Task shims ────────────────────────────────────────────────────────────────

exports.getTasksForNode = async (req, res) => {
  if (!req.useSharedWorkflows) return taskV1.getTasksForNode(req, res);

  try {
    const projectSourceId = await resolveProjectSourceId(req.params.nodeId);
    if (!projectSourceId) return taskV1.getTasksForNode(req, res);

    const { board } = await boardServiceV2.getProjectBoard(projectSourceId, {
      assigneeUserId: String(actorId(req)),
    });
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getBoardOverview = async (req, res) => {
  if (!req.useSharedWorkflows) return taskV1.getBoardOverview(req, res);

  try {
    const projectSourceId = await resolveProjectSourceId(req.params.nodeId);
    if (!projectSourceId) return taskV1.getBoardOverview(req, res);

    const viewAsUserId = req.query.viewAsUserId;
    const filters = viewAsUserId ? { assigneeUserId: viewAsUserId } : {};
    const { statuses, board } = await boardServiceV2.getProjectBoard(projectSourceId, filters);

    res.json({
      success: true,
      data: {
        lists: statuses.map(statusToList),
        board,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getUserBoard = async (req, res) => {
  // In v2, all users see the same board — viewAsUserId just filters by assignee
  if (!req.useSharedWorkflows) return taskV1.getUserBoard(req, res);

  try {
    const projectSourceId = await resolveProjectSourceId(req.params.nodeId);
    if (!projectSourceId) return taskV1.getUserBoard(req, res);

    const viewAsUserId = req.query.viewAsUserId;
    const filters = viewAsUserId ? { assigneeUserId: viewAsUserId } : {};
    const { board } = await boardServiceV2.getProjectBoard(projectSourceId, filters);
    res.json({ success: true, data: board });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.createTask = async (req, res) => {
  if (!req.useSharedWorkflows) return taskV1.createTask(req, res);

  try {
    const projectSourceId = await resolveProjectSourceId(req.params.nodeId);
    if (!projectSourceId) return taskV1.createTask(req, res);

    // Frontend sends listId — in v2 listId maps to workflowStatusId
    const body = { ...req.body, statusId: req.body.listId };
    const data = await boardServiceV2.createTask(actorId(req), projectSourceId, body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getTaskSummary = async (req, res) => {
  // Summary doesn't fundamentally change in v2 — just fall through
  return taskV1.getTaskSummary(req, res);
};

exports.getAssignableUsers = async (req, res) => {
  return taskV1.getAssignableUsers(req, res);
};

exports.getTask = async (req, res) => {
  return taskV1.getTask(req, res);
};

exports.updateTask = async (req, res) => {
  if (!req.useSharedWorkflows) return taskV1.updateTask(req, res);

  // Check if this task is migrated to v2
  const Task = require('../../MongoModels/task.model');
  const task = await Task.findOne({ _id: req.params.id }, { migratedToV2: 1 }).lean();
  if (!task?.migratedToV2) return taskV1.updateTask(req, res);

  try {
    const data = await boardServiceV2.updateTask(actorId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.moveTask = async (req, res) => {
  if (!req.useSharedWorkflows) return taskV1.moveTask(req, res);

  const Task = require('../../MongoModels/task.model');
  const task = await Task.findOne({ _id: req.params.id }, { migratedToV2: 1 }).lean();
  if (!task?.migratedToV2) return taskV1.moveTask(req, res);

  try {
    // Frontend sends listId — in v2 this is a workflowStatusId
    const data = await boardServiceV2.moveTaskToStatus(actorId(req), req.params.id, req.body.listId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.reorderTask = async (req, res) => {
  if (!req.useSharedWorkflows) return taskV1.reorderTask(req, res);

  const Task = require('../../MongoModels/task.model');
  const task = await Task.findOne({ _id: req.params.id }, { migratedToV2: 1 }).lean();
  if (!task?.migratedToV2) return taskV1.reorderTask(req, res);

  try {
    const data = await boardServiceV2.reorderTask(actorId(req), req.params.id, req.body.order);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.completeTask = async (req, res) => {
  if (!req.useSharedWorkflows) return taskV1.completeTask(req, res);

  const Task = require('../../MongoModels/task.model');
  const task = await Task.findOne({ _id: req.params.id }, { migratedToV2: 1 }).lean();
  if (!task?.migratedToV2) return taskV1.completeTask(req, res);

  try {
    const data = await boardServiceV2.completeTask(actorId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.archiveTask = async (req, res) => {
  if (!req.useSharedWorkflows) return taskV1.archiveTask(req, res);

  const Task = require('../../MongoModels/task.model');
  const task = await Task.findOne({ _id: req.params.id }, { migratedToV2: 1 }).lean();
  if (!task?.migratedToV2) return taskV1.archiveTask(req, res);

  try {
    const data = await boardServiceV2.archiveTask(actorId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.restoreTask = async (req, res) => {
  if (!req.useSharedWorkflows) return taskV1.restoreTask(req, res);

  const Task = require('../../MongoModels/task.model');
  const task = await Task.findOne({ _id: req.params.id }, { migratedToV2: 1 }).lean();
  if (!task?.migratedToV2) return taskV1.restoreTask(req, res);

  try {
    const data = await boardServiceV2.restoreTask(actorId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// assign / unassign fall through to v1 — assignment logic doesn't change in v2
exports.assignMember   = (req, res) => taskV1.assignMember(req, res);
exports.unassignMember = (req, res) => taskV1.unassignMember(req, res);
