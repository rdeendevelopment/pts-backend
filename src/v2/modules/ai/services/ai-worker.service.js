const { info, warn } = require('../../../kernel/logger');
const aiEnv = require('../config/ai.env');
const { getAiJobModel } = require('../models/aiJob.model');
const { AI_JOB_STATUSES } = require('../constants/execution.constants');
const actionRegistry = require('./ai-action-registry.service');
const aiJobService = require('./ai-job.service');

const queue = new Set();
let workerStarted = false;
let activeJobs = 0;

function enqueueJob(jobId) {
  queue.add(String(jobId));
  startWorker();
}

async function processJob(jobId) {
  const Model = getAiJobModel();
  const job = await Model.findById(jobId);
  if (!job || job.status !== AI_JOB_STATUSES.QUEUED) return;

  await aiJobService.markJobRunning(job);

  try {
    const actionConfig = await actionRegistry.getActionConfig(job.action);
    await aiJobService.updateJobProgress(job, 15, { stage: 'loaded' });

    const aiDispatcher = require('./ai-dispatcher.service');
    const result = await aiDispatcher.executeSyncPipeline({
      actionConfig,
      tenantId: job.tenantId,
      actorId: job.actorId,
      sourceModule: job.sourceModule,
      sourceId: job.sourceId,
      builtContext: job.contextSnapshot || {},
      input: job.inputSnapshot || {},
      mode: job.mode,
      jobId: job._id,
    });

    await aiJobService.completeJob(job, result);
    info('AI async job completed', { jobId: String(job._id), action: job.action });
  } catch (err) {
    await aiJobService.failJob(job, err);
    warn('AI async job failed', { jobId: String(job._id), message: err.message });
  }
}

async function drainQueue() {
  if (activeJobs >= aiEnv.worker.maxConcurrentJobs) return;

  for (const jobId of queue) {
    if (activeJobs >= aiEnv.worker.maxConcurrentJobs) break;
    queue.delete(jobId);
    activeJobs += 1;

    processJob(jobId)
      .catch((err) => warn('AI worker process error', { jobId, message: err.message }))
      .finally(() => {
        activeJobs -= 1;
      });
  }
}

function startWorker() {
  if (workerStarted) return;
  workerStarted = true;

  setInterval(() => {
    drainQueue().catch((err) => warn('AI worker drain failed', { message: err.message }));
  }, aiEnv.worker.pollIntervalMs);

  info('AI worker started', {
    pollIntervalMs: aiEnv.worker.pollIntervalMs,
    maxConcurrentJobs: aiEnv.worker.maxConcurrentJobs,
  });
}

module.exports = {
  enqueueJob,
  startWorker,
  processJob,
};
