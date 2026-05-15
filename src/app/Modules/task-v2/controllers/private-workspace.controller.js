const svc = require('../services/private-workspace.service');

function userId(req) {
  return req.auth?.user?._id || req.user?._id || req.auth?.user?.id || req.user?.id;
}

// ── Folders ───────────────────────────────────────────────────────────────────

exports.getFolders = async (req, res) => {
  try {
    const data = await svc.getFolders(userId(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.createFolder = async (req, res) => {
  try {
    const data = await svc.createFolder(userId(req), req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.renameFolder = async (req, res) => {
  try {
    const data = await svc.renameFolder(userId(req), req.params.folderId, req.body.name);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.deleteFolder = async (req, res) => {
  try {
    const data = await svc.deleteFolder(userId(req), req.params.folderId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.reorderFolders = async (req, res) => {
  try {
    const data = await svc.reorderFolders(userId(req), req.body.updates);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ── Lists ─────────────────────────────────────────────────────────────────────

exports.getLists = async (req, res) => {
  try {
    const data = await svc.getLists(userId(req), req.params.folderId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.createList = async (req, res) => {
  try {
    const data = await svc.createList(userId(req), req.params.folderId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.renameList = async (req, res) => {
  try {
    const data = await svc.renameList(userId(req), req.params.listId, req.body.name);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.deleteList = async (req, res) => {
  try {
    const data = await svc.deleteList(userId(req), req.params.listId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ── Tasks ─────────────────────────────────────────────────────────────────────

exports.getTasks = async (req, res) => {
  try {
    const data = await svc.getTasks(userId(req), req.params.listId, {
      isDone:          req.query.isDone !== undefined ? req.query.isDone === 'true' : undefined,
      includeArchived: req.query.includeArchived === 'true',
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.createTask = async (req, res) => {
  try {
    const data = await svc.createTask(userId(req), req.params.listId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const data = await svc.updateTask(userId(req), req.params.taskId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.toggleDone = async (req, res) => {
  try {
    const data = await svc.toggleDone(userId(req), req.params.taskId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const data = await svc.deleteTask(userId(req), req.params.taskId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.reorderTasks = async (req, res) => {
  try {
    const data = await svc.reorderTasks(userId(req), req.params.listId, req.body.updates);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.seedWorkspace = async (req, res) => {
  try {
    await svc.seedDefaultWorkspace(userId(req));
    res.json({ success: true, message: 'Default workspace ready' });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};
