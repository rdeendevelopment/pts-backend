const { AppError } = require('../../../kernel/errors');
const aiErrorCodes = require('../errors/aiErrorCodes');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { getAiJobModel } = require('../models/aiJob.model');
const { AI_JOB_STATUSES } = require('../constants/execution.constants');
const {
  emitJobCreated,
  emitJobStarted,
  emitJobProgress,
  emitJobCompleted,
  emitJobFailed,
} = require('../helpers/aiSocketEvents.helper');

function toJobDto(job) {
  if (!job) return null;
  const row = job.toObject ? job.toObject() : job;
  return {
    id: String(row._id),
    tenant_id: String(row.tenantId),
    actor_id: String(row.actorId),
    source_module: row.sourceModule,
    source_id: row.sourceId,
    action: row.action,
    mode: row.mode,
    status: row.status,
    progress: row.progress,
    result: row.result,
    error: row.error,
    retry_count: row.retryCount,
    trace_id: row.traceId,
    started_at: row.startedAt,
    completed_at: row.completedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

async function createJob({
  tenantId,
  actorId,
  sourceModule,
  sourceId,
  action,
  mode,
  inputSnapshot,
  contextSnapshot,
  traceId,
}) {
  const Model = getAiJobModel();
  const job = await Model.create({
    tenantId: assertObjectId(tenantId, 'tenantId'),
    actorId: assertObjectId(actorId, 'actorId'),
    sourceModule,
    sourceId: sourceId ? String(sourceId) : null,
    action,
    mode,
    status: AI_JOB_STATUSES.QUEUED,
    progress: 0,
    inputSnapshot,
    contextSnapshot,
    traceId,
  });

  const dto = toJobDto(job);
  emitJobCreated(String(actorId), dto);
  return job;
}

async function getJobById(jobId, tenantId) {
  const Model = getAiJobModel();
  const normalizedJobId = assertObjectId(jobId, 'jobId');
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');

  const job = await Model.findOne({
    _id: normalizedJobId,
    tenantId: normalizedTenantId,
    isDeleted: false,
  });

  if (!job) {
    throw new AppError('AI job not found', {
      status: 404,
      code: aiErrorCodes.AI_JOB_NOT_FOUND,
    });
  }

  return job;
}

async function markJobRunning(job) {
  job.status = AI_JOB_STATUSES.RUNNING;
  job.startedAt = new Date();
  job.progress = 5;
  await job.save();
  emitJobStarted(String(job.actorId), toJobDto(job));
  return job;
}

async function updateJobProgress(job, progress, meta = {}) {
  job.progress = Math.min(100, Math.max(0, progress));
  await job.save();
  emitJobProgress(String(job.actorId), String(job._id), job.progress, meta);
  return job;
}

function notifyDiscussFlowJobHandler(job, event) {
  try {
    const handler = require('../../discuss-flow/services/discussFlowAiJobHandler.service');
    if (event === 'completed') {
      handler.handleJobCompleted(job).catch(() => {});
    } else if (event === 'failed') {
      handler.handleJobFailed(job).catch(() => {});
    }
  } catch (_err) {
    // best-effort module hook
  }
}

async function completeJob(job, result) {
  job.status = AI_JOB_STATUSES.COMPLETED;
  job.progress = 100;
  job.result = result;
  job.completedAt = new Date();
  await job.save();
  emitJobCompleted(String(job.actorId), toJobDto(job));
  notifyDiscussFlowJobHandler(job, 'completed');
  return job;
}

async function failJob(job, error) {
  job.status = AI_JOB_STATUSES.FAILED;
  job.error = {
    message: error?.message || 'AI job failed',
    code: error?.code || aiErrorCodes.AI_JOB_FAILED,
    details: error?.details || null,
  };
  job.completedAt = new Date();
  await job.save();
  emitJobFailed(String(job.actorId), toJobDto(job));
  notifyDiscussFlowJobHandler(job, 'failed');
  return job;
}

async function listQueuedJobs(limit = 10) {
  const Model = getAiJobModel();
  return Model.find({ status: AI_JOB_STATUSES.QUEUED, isDeleted: false })
    .sort({ createdAt: 1 })
    .limit(limit);
}

module.exports = {
  toJobDto,
  createJob,
  getJobById,
  markJobRunning,
  updateJobProgress,
  completeJob,
  failJob,
  listQueuedJobs,
};
