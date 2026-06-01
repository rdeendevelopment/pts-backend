const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const exampleService = require('../services/example.service');

async function getStatus(req, res) {
  const data = await exampleService.getModuleStatus();
  return sendSuccess(res, data);
}

module.exports = {
  getStatus: asyncHandler(getStatus),
};
