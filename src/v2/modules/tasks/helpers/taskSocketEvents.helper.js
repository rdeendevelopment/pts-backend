const socketService = require('../../socket/services/socket.service');
const { emitBestEffort } = require('../../socket/helpers/socketEmit.helper');
const { SERVER_EVENTS } = require('../../socket/constants/socket.constants');

function projectPayload(projectId, extra = {}) {
  return {
    projectId: String(projectId),
    ...extra,
  };
}

function emitTaskCreated(projectId, task) {
  if (!task) return;

  emitBestEffort(() => {
    socketService.emitToProject(
      projectId,
      SERVER_EVENTS.TASK_CREATED,
      projectPayload(projectId, { task })
    );
  });
}

function emitTaskUpdated(projectId, task) {
  if (!task) return;

  emitBestEffort(() => {
    socketService.emitToProject(
      projectId,
      SERVER_EVENTS.TASK_UPDATED,
      projectPayload(projectId, { task })
    );
  });
}

function emitTaskMoved(projectId, task, move = {}) {
  if (!task) return;

  emitBestEffort(() => {
    socketService.emitToProject(
      projectId,
      SERVER_EVENTS.TASK_MOVED,
      projectPayload(projectId, { task, move })
    );
  });
}

function emitTaskCompleted(projectId, task) {
  if (!task) return;

  emitBestEffort(() => {
    socketService.emitToProject(
      projectId,
      SERVER_EVENTS.TASK_COMPLETED,
      projectPayload(projectId, { task })
    );
  });
}

function emitTaskArchived(projectId, task) {
  if (!task) return;

  emitBestEffort(() => {
    socketService.emitToProject(
      projectId,
      SERVER_EVENTS.TASK_ARCHIVED,
      projectPayload(projectId, { task })
    );
  });
}

function emitTaskRestored(projectId, task) {
  if (!task) return;

  emitBestEffort(() => {
    socketService.emitToProject(
      projectId,
      SERVER_EVENTS.TASK_RESTORED,
      projectPayload(projectId, { task })
    );
  });
}

function emitTaskCommentCreated(projectId, taskId, comment) {
  if (!comment) return;

  const payload = {
    projectId: String(projectId),
    taskId: String(taskId),
    comment,
  };

  emitBestEffort(() => {
    socketService.emitToProject(projectId, SERVER_EVENTS.TASK_COMMENT_CREATED, payload);
    socketService.emitToTask(taskId, SERVER_EVENTS.TASK_COMMENT_CREATED, payload);
  });
}

function emitTaskWorkflowUpdated(projectId, payload = {}) {
  emitBestEffort(() => {
    socketService.emitToProject(
      projectId,
      SERVER_EVENTS.TASK_WORKFLOW_UPDATED,
      projectPayload(projectId, payload)
    );
  });
}

function emitTaskDeleted(projectId, payload = {}) {
  emitBestEffort(() => {
    socketService.emitToProject(
      projectId,
      SERVER_EVENTS.TASK_DELETED,
      projectPayload(projectId, payload)
    );
  });
}

module.exports = {
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskMoved,
  emitTaskCompleted,
  emitTaskArchived,
  emitTaskRestored,
  emitTaskCommentCreated,
  emitTaskWorkflowUpdated,
  emitTaskDeleted,
};
