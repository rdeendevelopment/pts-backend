const { v4: uuidv4 } = require('uuid');
const aiEnv = require('../config/ai.env');
const { info, warn } = require('../../../kernel/logger');

function isLangSmithEnabled() {
  return aiEnv.langsmith.enabled && Boolean(aiEnv.langsmith.apiKey);
}

function createTraceId() {
  return uuidv4();
}

async function startTrace({ action, model, executionMode, metadata = {} }) {
  const traceId = createTraceId();
  if (!isLangSmithEnabled()) {
    return { traceId, enabled: false };
  }

  info('LangSmith trace started', {
    traceId,
    action,
    model,
    executionMode,
    project: aiEnv.langsmith.project,
    ...metadata,
  });

  return { traceId, enabled: true };
}

async function endTrace({
  traceId,
  action,
  status,
  latencyMs,
  inputTokens,
  outputTokens,
  costEstimate,
  error,
}) {
  if (!isLangSmithEnabled()) return;

  const payload = {
    traceId,
    action,
    status,
    latencyMs,
    inputTokens,
    outputTokens,
    costEstimate,
    error: error?.message || null,
  };

  try {
    const axios = require('axios');
    await axios.post(`${aiEnv.langsmith.endpoint}/runs`, {
      id: traceId,
      name: action,
      run_type: 'llm',
      inputs: {},
      outputs: { status },
      extra: payload,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiEnv.langsmith.apiKey,
      },
      timeout: 5000,
    });
  } catch (err) {
    warn('LangSmith trace export failed (best-effort)', { message: err.message, traceId });
  }
}

module.exports = {
  isLangSmithEnabled,
  createTraceId,
  startTrace,
  endTrace,
};
