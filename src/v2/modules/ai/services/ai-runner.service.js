const { AppError } = require('../../../kernel/errors');
const aiErrorCodes = require('../errors/aiErrorCodes');
const aiEnv = require('../config/ai.env');
const openaiProvider = require('../providers/openai.provider');
const promptBuilder = require('./prompt-builder.service');
const responseValidator = require('./response-validator.service');
const langsmithService = require('./langsmith.service');
const { estimateTokensFromPayload } = require('../helpers/estimateTokens.helper');

async function runAction({
  actionConfig,
  input = {},
  context = {},
  onProgress,
}) {
  if (!aiEnv.enabled) {
    throw new AppError('AI platform is disabled', {
      status: 503,
      code: aiErrorCodes.AI_DISABLED,
    });
  }

  const { systemPrompt, userPrompt, promptKey } = promptBuilder.buildPrompt({
    promptKey: actionConfig.promptKey,
    input,
    context,
  });

  const messages = promptBuilder.toChatMessages({ systemPrompt, userPrompt });
  const estimatedInput = estimateTokensFromPayload({ systemPrompt, userPrompt, input, context });

  const trace = await langsmithService.startTrace({
    action: actionConfig.action,
    model: actionConfig.model,
    executionMode: actionConfig.executionMode,
    metadata: { promptKey, estimatedInput },
  });

  if (onProgress) await onProgress(20, { stage: 'prompt_built' });

  try {
    const useJsonMode = actionConfig.responseSchema?.type === 'object'
      ? { type: 'json_object' }
      : undefined;

    const completion = await openaiProvider.chatCompletion({
      model: actionConfig.model,
      messages,
      temperature: actionConfig.temperature,
      maxTokens: actionConfig.maxSyncTokens,
      responseFormat: useJsonMode,
      timeoutMs: actionConfig.timeout,
    });

    if (onProgress) await onProgress(80, { stage: 'model_completed' });

    const validated = responseValidator.validateResponse(
      completion.content,
      actionConfig.responseSchema
    );

    await langsmithService.endTrace({
      traceId: trace.traceId,
      action: actionConfig.action,
      status: 'success',
      latencyMs: completion.latencyMs,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      costEstimate: null,
    });

    return {
      result: validated,
      raw: completion.content,
      model: completion.model,
      inputTokens: completion.inputTokens || estimatedInput,
      outputTokens: completion.outputTokens,
      totalTokens: completion.totalTokens || (completion.inputTokens + completion.outputTokens),
      latencyMs: completion.latencyMs,
      traceId: trace.traceId,
      promptSnapshot: JSON.stringify({ systemPrompt, userPrompt }),
      responseSnapshot: completion.content,
    };
  } catch (err) {
    await langsmithService.endTrace({
      traceId: trace.traceId,
      action: actionConfig.action,
      status: 'error',
      latencyMs: 0,
      error: err,
    });

    if (err.name === 'AbortError') {
      throw new AppError('AI request timed out', {
        status: 504,
        code: aiErrorCodes.AI_TIMEOUT,
        details: { action: actionConfig.action, timeout: actionConfig.timeout },
      });
    }

    if (err instanceof AppError) throw err;

    throw new AppError('AI provider call failed', {
      status: 502,
      code: aiErrorCodes.AI_PROVIDER_ERROR,
      details: { message: err.message },
    });
  }
}

module.exports = {
  runAction,
};
