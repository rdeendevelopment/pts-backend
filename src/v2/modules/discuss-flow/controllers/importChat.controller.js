const { sendSuccess } = require('../../../kernel/responses');
const importChatService = require('../services/importChat.service');

async function importChat(req, res) {
  const data = await importChatService.importChat(
    req.v2Auth.accountId,
    req.v2Auth.accountId,
    req.params.id,
    req.body
  );
  return sendSuccess(res, data, { status: 201 });
}

module.exports = {
  importChat,
};
