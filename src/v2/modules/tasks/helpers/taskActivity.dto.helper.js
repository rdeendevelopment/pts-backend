const EVENT_TYPE_TO_ACTION = {
  TASK_CREATED: 'created',
  TASK_UPDATED: 'updated',
  TASK_MOVED: 'moved',
  TASK_COMPLETED: 'completed',
  TASK_ARCHIVED: 'archived',
  TASK_RESTORED: 'restored',
  TASK_COMMENT_ADDED: 'comment_added',
  COLLABORATOR_ADDED: 'collaborator_added',
  COLLABORATOR_UPDATED: 'collaborator_added',
  COLLABORATOR_REMOVED: 'collaborator_removed',
  TASK_PERMANENTLY_DELETED: 'archived',
};

function mapEventTypeToAction(activity) {
  const eventType = String(activity?.eventType || '');
  const metadata = activity?.metadata || {};

  if (eventType === 'TASK_UPDATED' && metadata.action) {
    return String(metadata.action);
  }

  return EVENT_TYPE_TO_ACTION[eventType] || eventType.toLowerCase();
}

function toActivityEntryDto(activity, { task, projectName, actorName }) {
  if (!activity) return null;
  const doc = activity.toObject ? activity.toObject() : activity;
  const projectId = String(doc.projectId || task?.projectId || '');

  return {
    _id: String(doc._id),
    action: mapEventTypeToAction(doc),
    taskId: String(doc.taskId),
    taskTitle: task?.title || 'Untitled task',
    taskNumber: task?.taskNumber,
    performedBy: doc.performedBy ? String(doc.performedBy) : '',
    performedByName: actorName || 'Someone',
    projectRef: projectId
      ? { sourceId: projectId, sourceType: 'project' }
      : undefined,
    projectName: projectName || '',
    meta: doc.metadata || {},
    createdAt: doc.createdAt,
  };
}

module.exports = {
  mapEventTypeToAction,
  toActivityEntryDto,
};
