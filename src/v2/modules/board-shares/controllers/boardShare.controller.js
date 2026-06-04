const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const boardShareService = require('../services/boardShare.service');

async function listBoardShares(req, res) {
  const data = await boardShareService.listBoardShares(req.query);
  return sendSuccess(res, data);
}

async function getBoardShareById(req, res) {
  const shareId = assertObjectId(req.params.id, 'id');
  const data = await boardShareService.getBoardShareById(shareId);
  return sendSuccess(res, data);
}

async function createBoardShare(req, res) {
  const data = await boardShareService.createBoardShare(req.body, req.v2Auth?.accountId);
  return sendSuccess(res, data, { status: 201 });
}

async function updateBoardShare(req, res) {
  const shareId = assertObjectId(req.params.id, 'id');
  const data = await boardShareService.updateBoardShare(shareId, req.body);
  return sendSuccess(res, data);
}

async function revokeBoardShare(req, res) {
  const shareId = assertObjectId(req.params.id, 'id');
  const data = await boardShareService.revokeBoardShare(shareId, req.v2Auth?.accountId);
  return sendSuccess(res, data);
}

async function listMySharedProjects(req, res) {
  const data = await boardShareService.listMySharedProjects(req, req.query);
  return sendSuccess(res, data);
}

module.exports = {
  listBoardShares: asyncHandler(listBoardShares),
  listMySharedProjects: asyncHandler(listMySharedProjects),
  getBoardShareById: asyncHandler(getBoardShareById),
  createBoardShare: asyncHandler(createBoardShare),
  updateBoardShare: asyncHandler(updateBoardShare),
  revokeBoardShare: asyncHandler(revokeBoardShare),
};
