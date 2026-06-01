const { buildSourceHash } = require('../helpers/migrationBase.helper');
const { mapTaskPriority, mapTaskStatus } = require('../helpers/enumMaps.helper');

function transformLegacyTask(doc, refs) {
  const { projectId, workflowId, workflowStatusId, assignees, createdBy } = refs;
  if (!projectId || !workflowId || !workflowStatusId) {
    return {
      error: {
        code: 'TASK_PROJECT_MISSING',
        message: 'Task project/workflow references could not be resolved.',
      },
    };
  }

  return {
    payload: {
      projectId,
      workflowId,
      workflowStatusId,
      workflowOrder: Number(doc.workflowOrder || 0),
      taskNumber: doc.taskNumber || null,
      title: String(doc.title || '').trim() || 'Untitled Task',
      description: doc.description || '',
      priority: mapTaskPriority(doc.priority),
      status: mapTaskStatus(doc.status),
      assignees: assignees || [],
      reviewerId: refs.reviewerId || null,
      dueDate: doc.dueDate || null,
      startDate: doc.startDate || null,
      estimatedMinutes: doc.estimatedMinutes || null,
      tags: doc.tags || [],
      checklist: (doc.checklist || []).map((item, index) => ({
        text: item.text,
        isCompleted: Boolean(item.isCompleted),
        completedAt: item.completedAt || null,
        order: item.order ?? index,
      })),
      attachments: (doc.attachments || []).map((file) => ({
        fileName: file.name || file.fileName || 'attachment',
        fileUrl: file.url || file.fileUrl,
        mimeType: file.mimeType || null,
        fileSize: Number(file.size || file.fileSize || 0),
        uploadedBy: createdBy || null,
        uploadedAt: file.uploadedAt || doc.createdAt || new Date(),
      })),
      commentCount: Number(doc.commentCount || 0),
      completedAt: doc.completedAt || null,
      completedBy: refs.completedBy || null,
      archivedAt: doc.archivedAt || null,
      createdBy: createdBy || null,
      isDeleted: false,
    },
    sourceHash: buildSourceHash(doc, 'tasksV2'),
    legacyId: doc.taskNumber ?? null,
    oldObjectId: doc._id,
  };
}

function transformLegacyTaskComment(doc, refs) {
  if (!refs.taskId || !refs.projectId || !refs.authorId) {
    return { error: { code: 'MISSING_USER_MAP', message: 'Task comment references could not be resolved.' } };
  }

  return {
    payload: {
      taskId: refs.taskId,
      projectId: refs.projectId,
      authorId: refs.authorId,
      content: String(doc.text || doc.content || '').trim() || '(empty)',
      mentions: refs.mentions || [],
      parentCommentId: refs.parentCommentId || null,
      isDeleted: Boolean(doc.isDeleted),
      deletedAt: doc.isDeleted ? doc.updatedAt || new Date() : null,
    },
    sourceHash: buildSourceHash(doc, 'taskCommentsV2'),
    legacyId: doc.legacyCommentId ?? null,
    oldObjectId: doc._id,
  };
}

function transformLegacyTaskActivity(doc, refs) {
  if (!refs.taskId || !refs.projectId) {
    return { error: { code: 'TASK_PROJECT_MISSING', message: 'Task activity references could not be resolved.' } };
  }

  return {
    payload: {
      taskId: refs.taskId,
      projectId: refs.projectId,
      eventType: String(doc.eventType || doc.type || 'TASK_UPDATED').toUpperCase(),
      performedBy: refs.performedBy || null,
      metadata: doc.metadata || doc.details || null,
      createdAt: doc.createdAt || doc.performedAt || new Date(),
    },
    sourceHash: buildSourceHash(doc, 'taskActivitiesV2'),
    legacyId: null,
    oldObjectId: doc._id,
  };
}

module.exports = {
  transformLegacyTask,
  transformLegacyTaskComment,
  transformLegacyTaskActivity,
};
