const { sendSuccess } = require('../../../kernel/responses');
const guestLinkService = require('../services/guestLink.service');

async function createGuestLink(req, res) {
  const data = await guestLinkService.createGuestLink(
    req.v2Auth.accountId,
    req.v2Auth.accountId,
    req.body
  );
  return sendSuccess(res, data, { status: 201 });
}

async function revokeGuestLink(req, res) {
  const data = await guestLinkService.revokeGuestLink(
    req.v2Auth.accountId,
    req.v2Auth.accountId,
    req.params.id
  );
  return sendSuccess(res, data);
}

module.exports = {
  createGuestLink,
  revokeGuestLink,
};
