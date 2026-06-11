const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { EXECUTION_MODES } = require('../constants/execution.constants');

/**
 * Optional persisted action overrides (admin tuning).
 * Primary registry remains ai-actions.constants.js.
 */
const AiActionSchema = new Schema(
  {
    action: { type: String, required: true, unique: true, index: true },
    label: { type: String, default: null },
    sourceModule: { type: String, default: null },
    model: { type: String, default: null },
    temperature: { type: Number, default: 0.3 },
    executionMode: {
      type: String,
      enum: [...Object.values(EXECUTION_MODES)],
      default: EXECUTION_MODES.AUTO,
    },
    timeout: { type: Number, default: 15000 },
    maxSyncTokens: { type: Number, default: 4000 },
    responseSchema: { type: Schema.Types.Mixed, default: null },
    traceEnabled: { type: Boolean, default: true },
    saveLogs: { type: Boolean, default: true },
    promptKey: { type: String, default: null },
    enabled: { type: Boolean, default: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_ai_actions', timestamps: true }
);

async function ensureAiActionIndexes() {
  const Model = getV2Model('PtsAiAction', AiActionSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  AiActionSchema,
  ensureAiActionIndexes,
  getAiActionModel: () => getV2Model('PtsAiAction', AiActionSchema),
};
