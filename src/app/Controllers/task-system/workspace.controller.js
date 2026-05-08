const workspaceService = require('../../Services/task-system/workspace.service');

function actorId(req) {
  return req.auth?.user?._id || req.user?._id || req.auth?.user?.id || req.user?.id;
}

exports.getTree = async (req, res) => {
  const startedAt = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const data = await workspaceService.getUserTree(actorId(req), req.auth, {
      forceSync: String(req.query.forceSync || '').toLowerCase() === 'true',
    });
    console.info('[task-perf]', {
      requestId,
      route: 'GET /task-system/workspace/tree',
      userId: String(actorId(req) || ''),
      durationMs: Date.now() - startedAt,
      dbDurationMs: Date.now() - startedAt,
      resultCount: Array.isArray(data) ? data.length : 0,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.warn('[task-perf]', {
      requestId,
      route: 'GET /task-system/workspace/tree',
      userId: String(actorId(req) || ''),
      durationMs: Date.now() - startedAt,
      dbDurationMs: Date.now() - startedAt,
      error: err.message,
    });
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
