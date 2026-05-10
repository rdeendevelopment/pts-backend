const service = require('../services/announcement.service');

function sendError(res, error) {
  return res.status(error.status || 500).json({
    success: false,
    message: error.status ? error.message : 'Internal server error',
    error: error.status ? undefined : error.message,
  });
}

exports.listAdmin = async (req, res) => {
  try {
    const data = await service.listAdmin(req.auth, req.query || {});
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.create = async (req, res) => {
  try {
    const data = await service.create(req.auth, req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const data = await service.update(req.auth, req.params.id, req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.setEnabled = async (req, res) => {
  try {
    const data = await service.setEnabled(req.auth, req.params.id, req.body?.isActive);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.archive = async (req, res) => {
  try {
    const data = await service.archive(req.auth, req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listActive = async (req, res) => {
  try {
    const data = await service.listActive(req.auth);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.markRead = async (req, res) => {
  try {
    const data = await service.markRead(req.auth, req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.dismiss = async (req, res) => {
  try {
    const data = await service.dismiss(req.auth, req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};
