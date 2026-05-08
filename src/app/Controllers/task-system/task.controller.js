const taskService = require('../../Services/task-system/task.service');
const listService = require('../../Services/task-system/list.service');

function actorId(req) {
  return req.auth?.user?._id || req.user?._id || req.auth?.user?.id || req.user?.id;
}

function approxPayloadBytes(data) {
  try {
    return Buffer.byteLength(JSON.stringify(data));
  } catch {
    return 0;
  }
}

function perfLog(requestId, route, req, startedAt, data, extra = {}) {
  console.info('[task-perf]', {
    requestId,
    route,
    userId: String(actorId(req) || ''),
    durationMs: Date.now() - startedAt,
    dbDurationMs: Date.now() - startedAt,
    payloadBytes: approxPayloadBytes(data),
    ...extra,
  });
}

exports.getTasksForNode = async (req, res) => {
  try {
    const data = await taskService.getUserTasksInNode(actorId(req), req.params.nodeId, req.auth);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getTaskSummary = async (req, res) => {
  const startedAt = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const data = await taskService.getWorkspaceTaskSummary(actorId(req), req.auth, {
      limit: req.query.limit,
      viewAsUserId: taskService.canManageProjectTasks(req.auth) ? req.query.viewAsUserId : null,
    });
    perfLog(requestId, 'GET /task-system/tasks/summary', req, startedAt, data, {
      viewAsUserId: req.query.viewAsUserId || null,
      resultCount: Array.isArray(data) ? data.length : 0,
    });
    res.json({ success: true, data });
  } catch (err) {
    perfLog(requestId, 'GET /task-system/tasks/summary', req, startedAt, null, { error: err.message });
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getUserBoard = async (req, res) => {
  try {
    const viewAsUserId = req.query.viewAsUserId;
    if (viewAsUserId && taskService.canManageProjectTasks(req.auth)) {
      const data = await taskService.getAdminViewOfUserBoard(actorId(req), req.params.nodeId, viewAsUserId, req.auth);
      return res.json({ success: true, data });
    }
    const data = await taskService.getUserTasksInNode(actorId(req), req.params.nodeId, req.auth);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getBoardOverview = async (req, res) => {
  const startedAt = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const viewAsUserId = req.query.viewAsUserId;
    const [lists, board] = await Promise.all([
      listService.getListsForNode(actorId(req), req.params.nodeId, {
        viewAsUserId,
        auth: req.auth,
      }),
      viewAsUserId && taskService.canManageProjectTasks(req.auth)
        ? taskService.getAdminViewOfUserBoard(actorId(req), req.params.nodeId, viewAsUserId, req.auth)
        : taskService.getUserTasksInNode(actorId(req), req.params.nodeId, req.auth),
    ]);
    const data = { lists, board };
    perfLog(requestId, 'GET /task-system/tasks/node/:nodeId/overview', req, startedAt, data, {
      nodeId: req.params.nodeId,
      listCount: Array.isArray(lists) ? lists.length : 0,
      taskCount: Object.values(board || {}).reduce((sum, tasks) => sum + (Array.isArray(tasks) ? tasks.length : 0), 0),
    });
    res.json({ success: true, data });
  } catch (err) {
    perfLog(requestId, 'GET /task-system/tasks/node/:nodeId/overview', req, startedAt, null, {
      nodeId: req.params.nodeId,
      error: err.message,
    });
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getAssignableUsers = async (req, res) => {
  try {
    const data = await taskService.getAssignableUsersForNode(actorId(req), req.params.nodeId, req.auth);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getTask = async (req, res) => {
  try {
    const data = await taskService.getTask(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.createTask = async (req, res) => {
  try {
    const data = await taskService.createTask(actorId(req), req.params.nodeId, req.body, req.auth);
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (req.body?.assigneeIds?.length) {
      console.error('[task-assignment] create failed', {
        actorUserId: actorId(req),
        nodeId: req.params.nodeId,
        assigneeIds: req.body.assigneeIds,
        status: err.status || 500,
        message: err.message,
      });
    }
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const data = await taskService.updateTask(actorId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    if (req.body?.assigneeIds) {
      console.error('[task-assignment] update failed', {
        actorUserId: actorId(req),
        taskId: req.params.id,
        assigneeIds: req.body.assigneeIds,
        status: err.status || 500,
        message: err.message,
      });
    }
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.assignMember = async (req, res) => {
  try {
    const data = await taskService.assignMember(actorId(req), req.params.id, req.body.userId);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[task-assignment] assign API failed', {
      actorUserId: actorId(req),
      taskId: req.params.id,
      targetUserId: req.body?.userId,
      status: err.status || 500,
      message: err.message,
    });
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.unassignMember = async (req, res) => {
  try {
    const data = await taskService.unassignMember(actorId(req), req.params.id, req.body.userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.moveTask = async (req, res) => {
  try {
    const data = await taskService.moveTaskToList(actorId(req), req.params.id, req.body.listId, req.auth);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[task-dnd] move failed', {
      actorUserId: actorId(req),
      taskId: req.params.id,
      listId: req.body?.listId,
      status: err.status || 500,
      message: err.message,
    });
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.reorderTask = async (req, res) => {
  try {
    const data = await taskService.reorderTaskInList(actorId(req), req.params.id, req.body.order, req.body.listId);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[task-dnd] reorder failed', {
      actorUserId: actorId(req),
      taskId: req.params.id,
      listId: req.body?.listId,
      order: req.body?.order,
      status: err.status || 500,
      message: err.message,
    });
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.completeTask = async (req, res) => {
  try {
    const data = await taskService.completeTask(actorId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.archiveTask = async (req, res) => {
  try {
    const data = await taskService.archiveTask(actorId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.restoreTask = async (req, res) => {
  try {
    const data = await taskService.restoreTask(actorId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};
