const { getAiLogModel } = require('../models/aiLog.model');

async function saveLog({
  tenantId,
  userId,
  jobId,
  action,
  sourceModule,
  sourceId,
  model,
  executionMode,
  status = 'success',
  promptSnapshot,
  responseSnapshot,
  errorMessage,
  inputTokens = 0,
  outputTokens = 0,
  latencyMs = 0,
  traceId,
  metadata,
}) {
  const Model = getAiLogModel();
  return Model.create({
    tenantId,
    userId,
    jobId,
    action,
    sourceModule,
    sourceId,
    model,
    executionMode,
    status,
    promptSnapshot: promptSnapshot ? String(promptSnapshot).slice(0, 50_000) : null,
    responseSnapshot: responseSnapshot ? String(responseSnapshot).slice(0, 50_000) : null,
    errorMessage,
    inputTokens,
    outputTokens,
    latencyMs,
    traceId,
    metadata,
  });
}

module.exports = {
  saveLog,
};
