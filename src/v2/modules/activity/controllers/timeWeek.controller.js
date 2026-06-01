const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const timeWeekService = require('../services/timeWeek.service');

async function listWeeks(req, res) {
  const data = await timeWeekService.listWeeks(req.query, req);
  return sendSuccess(res, { items: data });
}

async function getWeekById(req, res) {
  const weekId = assertObjectId(req.params.id, 'id');
  const data = await timeWeekService.getWeekById(weekId, req);
  return sendSuccess(res, data);
}

async function createWeek(req, res) {
  const body = { ...req.body };
  if (body.userId) body.userId = assertObjectId(body.userId, 'userId');
  const data = await timeWeekService.createWeek(body, req.v2Auth.accountId, req);
  return sendSuccess(res, data, { status: 201 });
}

async function submitWeek(req, res) {
  const weekId = assertObjectId(req.params.id, 'id');
  const data = await timeWeekService.submitWeek(weekId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function approveWeek(req, res) {
  const weekId = assertObjectId(req.params.id, 'id');
  const data = await timeWeekService.approveWeek(weekId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function rejectWeek(req, res) {
  const weekId = assertObjectId(req.params.id, 'id');
  const data = await timeWeekService.rejectWeek(
    weekId,
    req.v2Auth.accountId,
    req,
    req.body.rejectionReason || req.body.rejection_reason || null
  );
  return sendSuccess(res, data);
}

module.exports = {
  listWeeks: asyncHandler(listWeeks),
  getWeekById: asyncHandler(getWeekById),
  createWeek: asyncHandler(createWeek),
  submitWeek: asyncHandler(submitWeek),
  approveWeek: asyncHandler(approveWeek),
  rejectWeek: asyncHandler(rejectWeek),
};
