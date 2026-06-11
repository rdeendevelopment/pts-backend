const { DAILY_FLOW_MODULE_KEY } = require('../constants/dailyFlow.constants');
const moduleRepository = require('../../modules/repositories/module.repository');
const settingsService = require('./dailyFlowSettings.service');
const aiService = require('./dailyFlowAi.service');

async function getModuleStatus(accountId) {
  const moduleDoc = await moduleRepository.findByKey(DAILY_FLOW_MODULE_KEY);
  const settings = await settingsService.getSettingsRecord(accountId);

  return {
    module_key: DAILY_FLOW_MODULE_KEY,
    product_name: 'My Day',
    ai_assistant_name: 'FlowMate AI',
    enabled: Boolean(moduleDoc && !moduleDoc.isDeleted && moduleDoc.status === 'active'),
    ai_enabled: aiService.isAiAvailable(settings),
    layer: 1,
    settings,
    weekend_planning_enabled: settings.weekend_planning_enabled,
  };
}

module.exports = {
  getModuleStatus,
};
