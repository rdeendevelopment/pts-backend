const aiEnv = require('../config/ai.env');
const { EXECUTION_MODES, TOKEN_THRESHOLDS } = require('../constants/execution.constants');
const { estimateTokensFromPayload, estimateTotalTokens } = require('../helpers/estimateTokens.helper');
const actionRegistry = require('./ai-action-registry.service');
const contextBuilder = require('./context-builder.service');
const tokenUsageService = require('./token-usage.service');
const aiRunner = require('./ai-runner.service');
const aiLogService = require('./ai-log.service');
const aiJobService = require('./ai-job.service');

function resolveActorId(actor, tenantId) {
  if (!actor) return tenantId;
  if (typeof actor === 'string') return actor;
  return actor.id || actor.accountId || actor.userId || tenantId;
}

function resolveExecutionMode(actionConfig, estimatedTokens, input = {}) {
  if (actionConfig.executionMode && actionConfig.executionMode !== EXECUTION_MODES.AUTO) {
    return actionConfig.executionMode;
  }

  if (input?.forceAsync === true || input?.expectedDurationSec > 10) {
    return EXECUTION_MODES.ASYNC;
  }

  if (estimatedTokens < TOKEN_THRESHOLDS.SYNC_MAX) {
    return EXECUTION_MODES.SYNC;
  }

  if (estimatedTokens <= TOKEN_THRESHOLDS.STREAM_MAX) {
    return EXECUTION_MODES.STREAM;
  }

  return EXECUTION_MODES.ASYNC;
}

async function executeSyncPipeline({
  actionConfig,
  tenantId,
  actorId,
  sourceModule,
  sourceId,
  builtContext,
  input,
  mode,
  jobId,
}) {
  const estimatedTokens = estimateTotalTokens({
    inputTokens: estimateTokensFromPayload({ input, context: builtContext }),
    maxOutputTokens: actionConfig.maxSyncTokens,
  });

  const reservation = await tokenUsageService.reserveTokens(tenantId, estimatedTokens);

  try {
    const runResult = await aiRunner.runAction({
      actionConfig,
      input,
      context: builtContext,
    });

    const actualTokens = runResult.totalTokens || (runResult.inputTokens + runResult.outputTokens);

    await tokenUsageService.settleUsage({
      tenantId,
      reservedTokens: reservation.reserved,
      actualTokens,
      userId: actorId,
      module: sourceModule,
      action: actionConfig.action,
      model: runResult.model,
      jobId,
      inputTokens: runResult.inputTokens,
      outputTokens: runResult.outputTokens,
      executionMode: mode,
      latencyMs: runResult.latencyMs,
      traceId: runResult.traceId,
    });

    if (actionConfig.saveLogs) {
      await aiLogService.saveLog({
        tenantId,
        userId: actorId,
        jobId,
        action: actionConfig.action,
        sourceModule,
        sourceId,
        model: runResult.model,
        executionMode: mode,
        status: 'success',
        promptSnapshot: runResult.promptSnapshot,
        responseSnapshot: runResult.responseSnapshot,
        inputTokens: runResult.inputTokens,
        outputTokens: runResult.outputTokens,
        latencyMs: runResult.latencyMs,
        traceId: runResult.traceId,
      });
    }

    return {
      mode,
      async: false,
      job_id: jobId ? String(jobId) : null,
      action: actionConfig.action,
      result: runResult.result,
      usage: {
        input_tokens: runResult.inputTokens,
        output_tokens: runResult.outputTokens,
        total_tokens: actualTokens,
      },
      trace_id: runResult.traceId,
    };
  } catch (err) {
    await tokenUsageService.releaseReservation(tenantId, reservation.reserved);

    if (actionConfig.saveLogs) {
      await aiLogService.saveLog({
        tenantId,
        userId: actorId,
        jobId,
        action: actionConfig.action,
        sourceModule,
        sourceId,
        model: actionConfig.model,
        executionMode: mode,
        status: 'error',
        errorMessage: err.message,
        traceId: null,
      });
    }

    throw err;
  }
}

async function execute({
  action,
  actor,
  tenantId,
  sourceModule,
  sourceId,
  context = {},
  input = {},
}) {
  if (!aiEnv.enabled) {
    const { AppError } = require('../../../kernel/errors');
    const aiErrorCodes = require('../errors/aiErrorCodes');
    throw new AppError('AI platform is disabled', {
      status: 503,
      code: aiErrorCodes.AI_DISABLED,
    });
  }

  const actionConfig = await actionRegistry.getActionConfig(action);
  const actorId = resolveActorId(actor, tenantId);
  const builtContext = contextBuilder.buildContext({
    sourceModule: sourceModule || actionConfig.sourceModule,
    sourceId,
    actor: { id: actorId },
    tenantId,
    context,
  });

  const estimatedInput = estimateTokensFromPayload({ input, context: builtContext });
  const estimatedTotal = estimateTotalTokens({
    inputTokens: estimatedInput,
    maxOutputTokens: actionConfig.maxSyncTokens,
  });

  const mode = resolveExecutionMode(actionConfig, estimatedTotal, input);

  if (mode === EXECUTION_MODES.ASYNC) {
    const job = await aiJobService.createJob({
      tenantId,
      actorId,
      sourceModule: sourceModule || actionConfig.sourceModule,
      sourceId,
      action: actionConfig.action,
      mode,
      inputSnapshot: input,
      contextSnapshot: builtContext,
    });

    // Lazy load to avoid circular dependency with ai-worker.service.js
    const aiWorker = require('./ai-worker.service');
    aiWorker.enqueueJob(String(job._id));

    return {
      mode,
      async: true,
      job_id: String(job._id),
      action: actionConfig.action,
      status: 'queued',
      poll_url: `/api/v2/ai/jobs/${String(job._id)}`,
    };
  }

  // SYNC and STREAM use same runner path in Layer 1 (stream upgrade later).
  return executeSyncPipeline({
    actionConfig,
    tenantId,
    actorId,
    sourceModule: sourceModule || actionConfig.sourceModule,
    sourceId,
    builtContext,
    input,
    mode,
    jobId: null,
  });
}

module.exports = {
  execute,
  resolveExecutionMode,
  executeSyncPipeline,
};
