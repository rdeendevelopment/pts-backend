const { sendSuccess } = require('../../../kernel/responses');
const questionService = require('../services/question.service');

async function createQuestion(req, res) {
  const data = await questionService.createQuestion(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listQuestions(req, res) {
  const data = await questionService.listQuestions(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.query);
  return sendSuccess(res, data);
}

module.exports = {
  createQuestion,
  listQuestions,
};
