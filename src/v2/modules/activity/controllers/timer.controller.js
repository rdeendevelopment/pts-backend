const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const timerService = require('../services/timer.service');

async function getActiveTimer(req, res) {
  if (!req.v2Activity?.userId) {
    return sendSuccess(res, { active: false });
  }
  const data = await timerService.getActiveTimerForUser(req.v2Activity.userId);
  return sendSuccess(res, data || { active: false });
}

async function listPausedTimers(req, res) {
  if (!req.v2Activity?.userId) {
    return sendSuccess(res, { items: [] });
  }
  const items = await timerService.listPausedTimersForUser(req.v2Activity.userId);
  return sendSuccess(res, { items });
}

async function startTimer(req, res) {
  const body = { ...req.body };
  body.projectId = assertObjectId(body.projectId, 'projectId');
  body.workCategoryId = assertObjectId(body.workCategoryId, 'workCategoryId');
  if (body.budgetId) body.budgetId = assertObjectId(body.budgetId, 'budgetId');
  if (body.clientId) body.clientId = assertObjectId(body.clientId, 'clientId');

  const data = await timerService.startTimer(body, req.v2Auth.accountId, req);
  return sendSuccess(res, data, { status: 201 });
}

async function stopTimer(req, res) {
  const timerId = assertObjectId(req.params.id, 'id');
  const data = await timerService.stopTimer(timerId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function correctTimer(req, res) {
  const timerId = assertObjectId(req.params.id, 'id');
  const data = await timerService.correctTimer(timerId, req.body, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function pauseTimer(req, res) {
  const timerId = assertObjectId(req.params.id, 'id');
  const data = await timerService.pauseTimer(timerId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function heartbeatTimer(req, res) {
  const timerId = assertObjectId(req.params.id, 'id');
  const data = await timerService.heartbeatTimer(timerId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function resumeTimer(req, res) {
  const timerId = assertObjectId(req.params.id, 'id');
  const data = await timerService.resumeTimer(timerId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function discardTimer(req, res) {
  const timerId = assertObjectId(req.params.id, 'id');
  const data = await timerService.discardTimer(timerId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function cancelTimer(req, res) {
  const timerId = assertObjectId(req.params.id, 'id');
  const data = await timerService.cancelTimer(timerId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

module.exports = {
  getActiveTimer: asyncHandler(getActiveTimer),
  listPausedTimers: asyncHandler(listPausedTimers),
  startTimer: asyncHandler(startTimer),
  pauseTimer: asyncHandler(pauseTimer),
  heartbeatTimer: asyncHandler(heartbeatTimer),
  resumeTimer: asyncHandler(resumeTimer),
  stopTimer: asyncHandler(stopTimer),
  correctTimer: asyncHandler(correctTimer),
  discardTimer: asyncHandler(discardTimer),
  cancelTimer: asyncHandler(cancelTimer),
};
