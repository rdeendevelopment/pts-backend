const taskService = require('../../Services/task-system/task.service');

function actorId(req) {
  return req.auth?.user?._id || req.user?._id || req.auth?.user?.id || req.user?.id;
}

exports.getTasksForNode = async (req, res) => {
  try {
    const data = await taskService.getUserTasksInNode(actorId(req), req.params.nodeId, req.auth);
    res.json({ success: true, data });
  } catch (err) {
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
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const data = await taskService.updateTask(actorId(req), req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.assignMember = async (req, res) => {
  try {
    const data = await taskService.assignMember(actorId(req), req.params.id, req.body.userId);
    res.json({ success: true, data });
  } catch (err) {
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
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.reorderTask = async (req, res) => {
  try {
    const data = await taskService.reorderTaskInList(actorId(req), req.params.id, req.body.order);
    res.json({ success: true, data });
  } catch (err) {
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
