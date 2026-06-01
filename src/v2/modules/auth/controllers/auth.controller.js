const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const authService = require('../services/auth.service');

async function register(req, res) {
  const data = await authService.register(req.body, req);
  return sendSuccess(res, data, { status: 201 });
}

async function login(req, res) {
  const data = await authService.login(req.body, req);
  return sendSuccess(res, data);
}

async function refresh(req, res) {
  const data = await authService.refresh(req.body.refreshToken, req);
  return sendSuccess(res, data);
}

async function logout(req, res) {
  const data = await authService.logout(req.body.refreshToken);
  return sendSuccess(res, data);
}

async function me(req, res) {
  const data = await authService.getMe(req.v2Auth.accountId);
  return sendSuccess(res, data);
}

module.exports = {
  register: asyncHandler(register),
  login: asyncHandler(login),
  refresh: asyncHandler(refresh),
  logout: asyncHandler(logout),
  me: asyncHandler(me),
};
