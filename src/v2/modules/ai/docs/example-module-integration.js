/**
 * Example: how a feature module calls the global AI platform.
 * DO NOT import openai or langchain in business modules.
 */
const { aiDispatcher } = require('../../ai');

async function summarizeTaskForUser({ accountId, task }) {
  const response = await aiDispatcher.execute({
    action: 'TASK_SUMMARIZE',
    actor: accountId,
    tenantId: accountId,
    sourceModule: 'tasks',
    sourceId: String(task._id),
    context: {
      projectId: task.projectId ? String(task.projectId) : null,
      status: task.status,
    },
    input: {
      title: task.title,
      description: task.description,
    },
  });

  if (response.async) {
    return {
      pending: true,
      jobId: response.job_id,
      pollUrl: response.poll_url,
    };
  }

  return {
    pending: false,
    summary: response.result?.summary,
    usage: response.usage,
  };
}

module.exports = {
  summarizeTaskForUser,
};
