const { sendSuccess } = require('../../../kernel/responses');
const messageService = require('../services/message.service');

async function createMessage(req, res) {
  const data = await messageService.createMessageWithActor(req.dfActor, req.params.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listMessages(req, res) {
  const data = await messageService.listMessagesWithActor(req.dfActor, req.params.id, req.query);
  return sendSuccess(res, data);
}

async function updateMessage(req, res) {
  const data = await messageService.updateMessageWithActor(
    req.dfActor,
    req.params.id,
    req.params.messageId,
    req.body
  );
  return sendSuccess(res, data);
}

async function deleteMessage(req, res) {
  const data = await messageService.deleteMessageWithActor(
    req.dfActor,
    req.params.id,
    req.params.messageId
  );
  return sendSuccess(res, data);
}

async function replyToMessage(req, res) {
  const data = await messageService.replyToMessageWithActor(
    req.dfActor,
    req.params.id,
    req.params.messageId,
    req.body
  );
  return sendSuccess(res, data, { status: 201 });
}

async function getAiSuggestions(req, res) {
  const data = await messageService.getAiSuggestions(
    req.dfActor,
    req.params.id,
    req.params.messageId
  );
  return sendSuccess(res, data);
}

async function analyzeMessage(req, res) {
  const data = await messageService.analyzeMessageWithActor(
    req.dfActor,
    req.params.id,
    req.params.messageId
  );
  return sendSuccess(res, data, { status: 202 });
}

module.exports = {
  createMessage,
  listMessages,
  updateMessage,
  deleteMessage,
  replyToMessage,
  getAiSuggestions,
  analyzeMessage,
};
