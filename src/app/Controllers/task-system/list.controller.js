const listService = require('../../Services/task-system/list.service');

function actorId(req) {
  return req.auth?.user?._id || req.user?._id || req.auth?.user?.id || req.user?.id;
}

exports.getLists = async (req, res) => {
  try {
    const data = await listService.getListsForNode(actorId(req), req.params.nodeId, {
      viewAsUserId: req.query.viewAsUserId,
      auth: req.auth,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.createList = async (req, res) => {
  try {
    const data = await listService.createList(actorId(req), req.params.nodeId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.renameList = async (req, res) => {
  try {
    const data = await listService.renameList(actorId(req), req.params.id, req.body.name);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.deleteList = async (req, res) => {
  try {
    const data = await listService.deleteList(actorId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.reorderLists = async (req, res) => {
  try {
    const data = await listService.reorderLists(actorId(req), req.params.nodeId, req.body.updates);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.archiveList = async (req, res) => {
  try {
    const data = await listService.archiveList(actorId(req), req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};
