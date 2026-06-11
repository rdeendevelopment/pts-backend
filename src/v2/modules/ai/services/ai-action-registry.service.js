const { AppError } = require('../../../kernel/errors');
const aiErrorCodes = require('../errors/aiErrorCodes');
const { AI_ACTION_REGISTRY, AI_ACTION_KEYS } = require('../constants/ai-actions.constants');
const { getAiActionModel } = require('../models/aiAction.model');

async function getActionOverride(actionKey) {
  const Model = getAiActionModel();
  return Model.findOne({ action: actionKey, enabled: true }).lean();
}

async function getActionConfig(actionKey) {
  const base = AI_ACTION_REGISTRY[actionKey];
  if (!base) {
    throw new AppError(`Unknown AI action: ${actionKey}`, {
      status: 400,
      code: aiErrorCodes.AI_ACTION_NOT_FOUND,
      details: { action: actionKey, available: AI_ACTION_KEYS },
    });
  }

  const override = await getActionOverride(actionKey);
  if (!override) return { ...base };

  return {
    ...base,
    ...override,
    action: base.action,
    responseSchema: override.responseSchema || base.responseSchema,
  };
}

function listActions() {
  return AI_ACTION_KEYS.map((key) => {
    const config = AI_ACTION_REGISTRY[key];
    return {
      action: config.action,
      label: config.label,
      sourceModule: config.sourceModule,
      model: config.model,
      executionMode: config.executionMode,
      maxSyncTokens: config.maxSyncTokens,
      timeout: config.timeout,
    };
  });
}

module.exports = {
  getActionConfig,
  listActions,
  AI_ACTION_KEYS,
};
