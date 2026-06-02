const { formatTaskDisplayId } = require('../helpers/taskKeyPrefix.helper');

function toTaskDto(task, { taskKeyPrefix } = {}) {
  if (!task) return null;
  const doc = task.toObject ? task.toObject() : task;
  const prefix = taskKeyPrefix || doc.taskKeyPrefix || null;
  const taskNumber = doc.taskNumber;
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    workflowId: String(doc.workflowId),
    workflowStatusId: String(doc.workflowStatusId),
    workflowOrder: doc.workflowOrder,
    taskNumber,
    taskKeyPrefix: prefix,
    taskDisplayId: formatTaskDisplayId(prefix, taskNumber),
    title: doc.title,
    description: doc.description,
    priority: doc.priority,
    status: doc.status,
    assignees: (doc.assignees || []).map((a) => ({
      userId: String(a.userId),
      name: a.name,
      email: a.email,
      assignedAt: a.assignedAt,
      assignedBy: a.assignedBy ? String(a.assignedBy) : null,
    })),
    reviewerId: doc.reviewerId ? String(doc.reviewerId) : null,
    dueDate: doc.dueDate,
    startDate: doc.startDate,
    estimatedMinutes: doc.estimatedMinutes,
    tags: doc.tags || [],
    checklist: doc.checklist || [],
    attachments: (doc.attachments || []).map((a) => toAttachmentDto(a)),
    commentCount: doc.commentCount,
    completedAt: doc.completedAt,
    completedBy: doc.completedBy ? String(doc.completedBy) : null,
    archivedAt: doc.archivedAt,
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    createdByName: doc.createdByName || null,
    createdByEmail: doc.createdByEmail || null,
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toWorkflowDto(workflow) {
  if (!workflow) return null;
  const doc = workflow.toObject ? workflow.toObject() : workflow;
  return {
    id: String(doc._id),
    projectId: String(doc.projectId),
    name: doc.name,
    isDefault: doc.isDefault,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toWorkflowStatusDto(status) {
  if (!status) return null;
  const doc = status.toObject ? status.toObject() : status;
  const id = String(doc._id);
  return {
    id,
    _id: id,
    workflowId: String(doc.workflowId),
    projectId: String(doc.projectId),
    name: doc.name,
    key: doc.key,
    order: doc.order,
    category: doc.category,
    color: doc.color,
    icon: doc.icon,
    isTerminal: doc.isTerminal,
    status: doc.status,
    isDefault: ['backlog', 'todo', 'done', 'archived'].includes(String(doc.key)),
    isSystem: ['backlog', 'todo', 'done', 'archived'].includes(String(doc.key)),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toProjectSettingsDto({
  project,
  workflow,
  statuses = [],
  stats = {},
  canManage = false,
}) {
  const projectId = String(project._id);
  return {
    id: projectId,
    project: {
      id: projectId,
      name: project.name || '',
      description: project.description || '',
      status: project.status,
      isActive: !['archived', 'cancelled', 'completed'].includes(String(project.status || '').toLowerCase()),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    name: project.name || '',
    description: project.description || '',
    status: project.status,
    isActive: !['archived', 'cancelled', 'completed'].includes(String(project.status || '').toLowerCase()),
    createdAt: project.createdAt,
    workflow: workflow ? toWorkflowDto(workflow) : null,
    statuses: statuses.map(toWorkflowStatusDto),
    stats: {
      taskCount: Number(stats.taskCount) || 0,
      memberCount: Number(stats.memberCount) || 0,
      overdueCount: Number(stats.overdueCount) || 0,
    },
    canManage,
  };
}

function toAttachmentDto(attachment) {
  if (!attachment) return null;
  const doc = attachment.toObject ? attachment.toObject() : attachment;
  const id = doc._id ? String(doc._id) : (doc.id ? String(doc.id) : null);
  const fileName = doc.fileName || doc.name || 'Attachment';
  const fileUrl = doc.fileUrl || doc.url || '';
  const mimeType = doc.mimeType || doc.fileType || null;
  const fileSize = Number(doc.fileSize ?? doc.size ?? 0);

  return {
    id,
    _id: id,
    fileName,
    fileUrl,
    mimeType,
    fileType: mimeType,
    fileSize,
    uploadedBy: doc.uploadedBy ? String(doc.uploadedBy) : null,
    uploadedAt: doc.uploadedAt,
    name: fileName,
    url: fileUrl,
    size: fileSize,
  };
}

function toCommentDto(comment) {
  if (!comment) return null;
  const doc = comment.toObject ? comment.toObject() : comment;
  return {
    id: String(doc._id),
    taskId: String(doc.taskId),
    projectId: String(doc.projectId),
    authorId: String(doc.authorId),
    content: doc.content,
    mentions: (doc.mentions || []).map(String),
    attachments: doc.attachments || [],
    parentCommentId: doc.parentCommentId ? String(doc.parentCommentId) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toNotificationDto(notification) {
  if (!notification) return null;
  const doc = notification.toObject ? notification.toObject() : notification;
  const metadata = doc.metadata || {};
  const taskTitle = metadata.taskTitle || doc.title || '';
  const message = doc.body || metadata.message || doc.title || '';

  return {
    id: String(doc._id),
    _id: String(doc._id),
    userId: doc.userId ? String(doc.userId) : null,
    receiverId: doc.userId ? String(doc.userId) : null,
    taskId: doc.taskId ? String(doc.taskId) : null,
    projectId: doc.projectId ? String(doc.projectId) : null,
    activityId: doc.activityId ? String(doc.activityId) : null,
    entityType: doc.entityType || (doc.taskId ? 'task' : null),
    entityId: doc.entityId || (doc.taskId ? String(doc.taskId) : null),
    actorId: doc.actorId ? String(doc.actorId) : (metadata.triggeredBy ? String(metadata.triggeredBy) : null),
    actorName: doc.actorName || metadata.triggeredByName || '',
    priority: doc.priority || 'normal',
    type: doc.type,
    title: doc.title || taskTitle,
    body: doc.body || message,
    message,
    read: Boolean(doc.isRead),
    taskTitle,
    isRead: Boolean(doc.isRead),
    readAt: doc.readAt,
    triggeredByName: doc.actorName || metadata.triggeredByName || '',
    triggeredBy: metadata.triggeredBy ? String(metadata.triggeredBy) : null,
    sourceCommentId: metadata.sourceCommentId ? String(metadata.sourceCommentId) : null,
    link: doc.link || metadata.link || null,
    projectRef: doc.projectId ? {
      sourceId: String(doc.projectId),
      sourceType: 'project',
    } : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toMentionDto({ comment, task, project, author }) {
  if (!comment) return null;
  const doc = comment.toObject ? comment.toObject() : comment;
  const authorName = author?.displayName
    || `${author?.firstName || ''} ${author?.lastName || ''}`.trim()
    || author?.email
    || 'Someone';

  return {
    id: String(doc._id),
    _id: String(doc._id),
    taskId: String(doc.taskId),
    projectId: String(doc.projectId),
    text: doc.content,
    content: doc.content,
    createdAt: doc.createdAt,
    mentionedAt: doc.createdAt,
    authorName,
    authorEmail: author?.email || '',
    authorId: String(doc.authorId),
    taskTitle: task?.title || 'Untitled task',
    taskNumber: task?.taskNumber,
    projectSourceId: String(doc.projectId),
    projectName: project?.name || '',
    task: task
      ? {
        id: String(task._id),
        title: task.title || '',
        taskNumber: task.taskNumber,
      }
      : null,
    project: project
      ? {
        id: String(project._id),
        name: project.name || '',
      }
      : null,
    comment: {
      id: String(doc._id),
      content: doc.content,
      createdAt: doc.createdAt,
    },
  };
}

function toCommentAttachmentDto(stored) {
  if (!stored) return null;
  return {
    name: stored.fileName || stored.name || 'Attachment',
    url: stored.fileUrl || stored.url || '',
    mimeType: stored.mimeType || '',
    size: Number(stored.fileSize ?? stored.size ?? 0),
    storageProvider: 'local',
    publicId: null,
  };
}

function toCollaboratorDto(collaborator, user) {
  if (!collaborator) return null;
  const doc = collaborator.toObject ? collaborator.toObject() : collaborator;
  const id = String(doc._id);
  const authorName = user?.displayName
    || `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
    || user?.email
    || '';

  return {
    id,
    _id: id,
    taskId: String(doc.taskId),
    projectId: String(doc.projectId),
    userId: String(doc.userId),
    name: authorName,
    email: user?.email || '',
    accessType: doc.accessType || 'comment',
    addedAt: doc.createdAt,
    createdAt: doc.createdAt,
    isActive: Boolean(doc.isActive),
  };
}

module.exports = {
  toTaskDto,
  toWorkflowDto,
  toWorkflowStatusDto,
  toProjectSettingsDto,
  toCommentDto,
  toAttachmentDto,
  toCommentAttachmentDto,
  toNotificationDto,
  toMentionDto,
  toCollaboratorDto,
};
