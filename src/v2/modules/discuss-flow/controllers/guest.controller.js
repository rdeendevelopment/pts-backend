const { sendSuccess } = require('../../../kernel/responses');
const guestLinkService = require('../services/guestLink.service');
const guestSessionService = require('../services/guestSession.service');

async function previewGuestLink(req, res) {
  const data = await guestLinkService.getGuestPreview(req.params.token);
  return sendSuccess(res, data);
}

async function joinGuestLink(req, res) {
  const data = await guestSessionService.joinGuestSession(req.params.token, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function getGuestSession(req, res) {
  const data = guestSessionService.getGuestSessionInfo(req.dfGuestSession);
  return sendSuccess(res, data);
}

async function sendGuestMessage(req, res) {
  const data = await guestSessionService.sendGuestMessage(req.dfGuestSession, req.body);
  return sendSuccess(res, data, { status: 201 });
}

module.exports = {
  previewGuestLink,
  joinGuestLink,
  getGuestSession,
  sendGuestMessage,
};
