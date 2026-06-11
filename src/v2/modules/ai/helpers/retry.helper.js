const { warn } = require('../../../kernel/logger');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry async fn with exponential backoff.
 */
async function withRetry(fn, { maxRetries = 2, baseDelayMs = 500, label = 'ai-call' } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries) break;

      const delay = baseDelayMs * (2 ** attempt);
      warn(`${label} failed, retrying`, {
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        message: err.message,
      });
      await sleep(delay);
    }
  }

  throw lastError;
}

module.exports = {
  sleep,
  withRetry,
};
