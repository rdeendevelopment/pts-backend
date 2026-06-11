/** AI job socket events — colon notation per product spec. */
const AI_SOCKET_EVENTS = {
  JOB_CREATED: 'ai:job:created',
  JOB_STARTED: 'ai:job:started',
  JOB_PROGRESS: 'ai:job:progress',
  JOB_COMPLETED: 'ai:job:completed',
  JOB_FAILED: 'ai:job:failed',
};

module.exports = {
  AI_SOCKET_EVENTS,
};
