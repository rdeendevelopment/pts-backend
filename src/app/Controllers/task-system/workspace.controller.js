const workspaceService = require('../../Services/task-system/workspace.service');

function actorId(req) {
  return req.auth?.user?._id || req.user?._id || req.auth?.user?.id || req.user?.id;
}

exports.getTree = async (req, res) => {
  try {
    const data = await workspaceService.getUserTree(actorId(req), req.auth);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.createFolder = async (req, res) => {
  try {
    const data = await workspaceService.createFolder(actorId(req), req.body, req.auth);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.renameNode = async (req, res) => {
  try {
    const data = await workspaceService.renameNode(actorId(req), req.params.id, req.body.name, req.auth);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.deleteFolder = async (req, res) => {
  try {
    const data = await workspaceService.deleteFolder(actorId(req), req.params.id, req.auth);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.reorderNodes = async (req, res) => {
  try {
    const data = await workspaceService.reorderNodes(actorId(req), req.body.updates, req.auth);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};
