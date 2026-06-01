const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const announcementService = require('../services/announcement.service');

async function listAdmin(req, res) {
  const data = await announcementService.listAdmin(req.v2Auth, req.query || {});
  return sendSuccess(res, data);
}

async function listActive(req, res) {
  const data = await announcementService.listActive(req.v2Auth);
  return sendSuccess(res, data);
}

async function create(req, res) {
  const data = await announcementService.create(req.v2Auth, req.body || {});
  return sendSuccess(res, data, { status: 201 });
}

async function update(req, res) {
  const data = await announcementService.update(req.v2Auth, req.params.id, req.body || {});
  return sendSuccess(res, data);
}

async function setEnabled(req, res) {
  const isActive = req.body?.isActive ?? req.body?.is_active;
  const data = await announcementService.setEnabled(req.v2Auth, req.params.id, isActive);
  return sendSuccess(res, data);
}

async function archive(req, res) {
  const data = await announcementService.archive(req.v2Auth, req.params.id);
  return sendSuccess(res, data);
}

async function markRead(req, res) {
  const data = await announcementService.markRead(req.v2Auth, req.params.id);
  return sendSuccess(res, data);
}

async function dismiss(req, res) {
  const data = await announcementService.dismiss(req.v2Auth, req.params.id);
  return sendSuccess(res, data);
}

module.exports = {
  listAdmin: asyncHandler(listAdmin),
  listActive: asyncHandler(listActive),
  create: asyncHandler(create),
  update: asyncHandler(update),
  setEnabled: asyncHandler(setEnabled),
  archive: asyncHandler(archive),
  markRead: asyncHandler(markRead),
  dismiss: asyncHandler(dismiss),
};
