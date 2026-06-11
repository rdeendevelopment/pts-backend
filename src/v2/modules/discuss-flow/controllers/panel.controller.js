const { sendSuccess } = require('../../../kernel/responses');
const panelService = require('../services/panel.service');

async function getTopicPanel(req, res) {
  const data = await panelService.getTopicPanel(req.dfActor, req.params.id);
  return sendSuccess(res, data);
}

module.exports = {
  getTopicPanel,
};
