const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const userService = require('../services/user.service');

async function listUsers(req, res) {
  const data = await userService.listUsers(req.query);
  return sendSuccess(res, data);
}

async function getUserById(req, res) {
  const userId = assertObjectId(req.params.id, 'id');
  const data = await userService.getUserById(userId);
  return sendSuccess(res, data);
}

async function getMyProfile(req, res) {
  const data = await userService.getMyProfile(req.v2Auth.accountId);
  return sendSuccess(res, data);
}

async function createUser(req, res) {
  const data = await userService.createUser(req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function updateUser(req, res) {
  const userId = assertObjectId(req.params.id, 'id');
  const data = await userService.updateUser(userId, req.body);
  return sendSuccess(res, data);
}

async function updateUserStatus(req, res) {
  const userId = assertObjectId(req.params.id, 'id');
  const data = await userService.updateUserStatus(userId, req.body.status);
  return sendSuccess(res, data);
}

async function deleteUser(req, res) {
  const userId = assertObjectId(req.params.id, 'id');
  const force = String(req.query.force || '').toLowerCase() === 'true';
  const data = await userService.deleteUser(userId, { force });
  return sendSuccess(res, data);
}

async function resetUserPassword(req, res) {
  const userId = assertObjectId(req.params.id, 'id');
  const data = await userService.resetUserPassword(userId, req.body);
  return sendSuccess(res, data);
}

async function updateMyProfile(req, res) {
  const data = await userService.updateMyProfile(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data);
}

async function changeMyPassword(req, res) {
  const data = await userService.changeMyPassword(req.v2Auth.accountId, req.body);
  return sendSuccess(res, data);
}

async function resolveCurrentUserId(req) {
  const user = await userService.ensureUserProfileForAccount(req.v2Auth.accountId);
  return String(user._id);
}

async function getMyPresence(req, res) {
  const data = await userService.getMyPresence(await resolveCurrentUserId(req));
  return sendSuccess(res, data);
}

async function updatePresenceMode(req, res) {
  const data = await userService.updatePresenceMode(await resolveCurrentUserId(req), req.body.presenceMode);
  return sendSuccess(res, data);
}

async function updateCustomStatus(req, res) {
  const data = await userService.updateCustomStatus(await resolveCurrentUserId(req), req.body);
  return sendSuccess(res, data);
}

async function clearCustomStatus(req, res) {
  const data = await userService.clearCustomStatus(await resolveCurrentUserId(req));
  return sendSuccess(res, data);
}

module.exports = {
  listUsers: asyncHandler(listUsers),
  getUserById: asyncHandler(getUserById),
  getMyProfile: asyncHandler(getMyProfile),
  updateMyProfile: asyncHandler(updateMyProfile),
  changeMyPassword: asyncHandler(changeMyPassword),
  createUser: asyncHandler(createUser),
  updateUser: asyncHandler(updateUser),
  updateUserStatus: asyncHandler(updateUserStatus),
  deleteUser: asyncHandler(deleteUser),
  resetUserPassword: asyncHandler(resetUserPassword),
  getMyPresence: asyncHandler(getMyPresence),
  updatePresenceMode: asyncHandler(updatePresenceMode),
  updateCustomStatus: asyncHandler(updateCustomStatus),
  clearCustomStatus: asyncHandler(clearCustomStatus),
  resolveCurrentUserId,
};
