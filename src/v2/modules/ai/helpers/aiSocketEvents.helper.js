const { emitBestEffort } = require('../../socket/helpers/socketEmit.helper');
const socketService = require('../../socket/services/socket.service');
const { AI_SOCKET_EVENTS } = require('../constants/ai-socket.constants');

function emitAiJobEvent(actorId, eventName, payload) {
  if (!actorId) return;
  emitBestEffort(() => {
    socketService.emitToUser(actorId, eventName, payload);
  });
}

function emitJobCreated(actorId, job) {
  emitAiJobEvent(actorId, AI_SOCKET_EVENTS.JOB_CREATED, { job });
}

function emitJobStarted(actorId, job) {
  emitAiJobEvent(actorId, AI_SOCKET_EVENTS.JOB_STARTED, { job });
}

function emitJobProgress(actorId, jobId, progress, meta = {}) {
  emitAiJobEvent(actorId, AI_SOCKET_EVENTS.JOB_PROGRESS, { jobId, progress, ...meta });
}

function emitJobCompleted(actorId, job) {
  emitAiJobEvent(actorId, AI_SOCKET_EVENTS.JOB_COMPLETED, { job });
}

function emitJobFailed(actorId, job) {
  emitAiJobEvent(actorId, AI_SOCKET_EVENTS.JOB_FAILED, { job });
}

module.exports = {
  emitJobCreated,
  emitJobStarted,
  emitJobProgress,
  emitJobCompleted,
  emitJobFailed,
  AI_SOCKET_EVENTS,
};
