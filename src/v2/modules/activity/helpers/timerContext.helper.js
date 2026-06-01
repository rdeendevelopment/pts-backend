function toTaskKey(taskId) {
  const id = taskId ? String(taskId).trim() : '';
  return id || 'NO_TASK';
}

function buildTimerContextFields(payload = {}) {
  const clientId = payload.clientId || null;
  const projectId = payload.projectId;
  const workCategoryId = payload.workCategoryId;
  const taskId = payload.taskId || null;
  return {
    clientId,
    projectId,
    workCategoryId,
    taskId,
    taskKey: toTaskKey(taskId),
  };
}

function buildContextQuery(userId, context, { status = null } = {}) {
  const query = {
    userId,
    projectId: context.projectId,
    workCategoryId: context.workCategoryId,
    taskKey: context.taskKey,
    isDeleted: false,
  };

  if (context.clientId) {
    query.clientId = context.clientId;
  } else {
    query.$or = [{ clientId: null }, { clientId: { $exists: false } }];
  }

  if (status) {
    query.status = status;
  }

  return query;
}

function contextsMatch(timer, context) {
  const timerClient = timer.clientId ? String(timer.clientId) : '';
  const ctxClient = context.clientId ? String(context.clientId) : '';
  if (timerClient !== ctxClient) return false;

  return String(timer.projectId) === String(context.projectId)
    && String(timer.workCategoryId) === String(context.workCategoryId)
    && toTaskKey(timer.taskId) === context.taskKey;
}

function isDuplicateKeyError(err) {
  return err?.code === 11000 || err?.code === 11001;
}

module.exports = {
  toTaskKey,
  buildTimerContextFields,
  buildContextQuery,
  contextsMatch,
  isDuplicateKeyError,
};
