/** Execution mode for AI actions. */
const EXECUTION_MODES = {
  SYNC: 'sync',
  STREAM: 'stream',
  ASYNC: 'async',
  AUTO: 'auto',
};

/** Token thresholds for auto mode resolution. */
const TOKEN_THRESHOLDS = {
  SYNC_MAX: 3000,
  STREAM_MAX: 10000,
};

/** Default timeouts (ms). */
const DEFAULT_TIMEOUT_MS = {
  sync: 15000,
  stream: 60000,
  async: 300000,
};

/** Job statuses. */
const AI_JOB_STATUSES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/** Max retries for failed AI calls. */
const DEFAULT_MAX_RETRIES = 2;

module.exports = {
  EXECUTION_MODES,
  TOKEN_THRESHOLDS,
  DEFAULT_TIMEOUT_MS,
  AI_JOB_STATUSES,
  DEFAULT_MAX_RETRIES,
};
