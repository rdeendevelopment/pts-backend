function baseDto(row) {
  const doc = row?.toObject ? row.toObject() : row;
  if (!doc) return null;
  return doc;
}

function toWorkspaceDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    tenant_id: String(row.tenantId),
    name: row.name,
    slug: row.slug,
    description: row.description || null,
    icon: row.icon || null,
    visibility: row.visibility,
    status: row.status,
    owner_id: String(row.ownerId),
    member_count: row.memberCount ?? 0,
    topic_count: row.topicCount ?? 0,
    settings: row.settings || {},
    created_by: row.createdBy ? String(row.createdBy) : null,
    updated_by: row.updatedBy ? String(row.updatedBy) : null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toTopicDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    workspace_id: String(row.workspaceId),
    tenant_id: String(row.tenantId),
    title: row.title,
    slug: row.slug,
    description: row.description || null,
    status: row.status,
    priority: row.priority,
    category: row.category || null,
    tags: row.tags || [],
    created_by: String(row.createdBy),
    owner_id: String(row.ownerId),
    last_activity_at: row.lastActivityAt || null,
    last_message_at: row.lastMessageAt || null,
    message_count: row.messageCount ?? 0,
    requirement_count: row.requirementCount ?? 0,
    question_count: row.questionCount ?? 0,
    decision_count: row.decisionCount ?? 0,
    document_count: row.documentCount ?? 0,
    task_count: row.taskCount ?? 0,
    ai_summary_id: row.aiSummaryId ? String(row.aiSummaryId) : null,
    timeline_enabled: row.timelineEnabled !== false,
    settings: row.settings || {},
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toTopicMemberDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    topic_id: String(row.topicId),
    account_id: String(row.accountId),
    role: row.role,
    permissions: row.permissions || {},
    joined_at: row.joinedAt || row.createdAt || null,
    last_seen_at: row.lastSeenAt || null,
    notification_settings: row.notificationSettings || {},
  };
}

function toMessageDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    topic_id: String(row.topicId),
    thread_id: row.threadId ? String(row.threadId) : null,
    parent_message_id: row.parentMessageId ? String(row.parentMessageId) : null,
    reply_to_message_id: row.replyToMessageId ? String(row.replyToMessageId) : null,
    author_id: row.authorId ? String(row.authorId) : null,
    author_name: row.authorName || null,
    author_type: row.authorType,
    message_type: row.messageType,
    message_status: row.messageStatus || 'active',
    source: row.source || 'manual',
    source_label: row.sourceLabel || null,
    import_batch_id: row.importBatchId || null,
    client_message_id: row.clientMessageId || null,
    ai_suggestion_status: row.aiSuggestionStatus || 'none',
    content: row.content,
    mentions: row.mentions || [],
    attachments: row.attachments || [],
    metadata: row.metadata || {},
    is_edited: Boolean(row.isEdited),
    edited_at: row.editedAt || null,
    is_deleted: Boolean(row.isDeleted),
    deleted_at: row.deletedAt || null,
    created_at: row.createdAt || null,
  };
}

function toGuestLinkDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    tenant_id: String(row.tenantId),
    workspace_id: String(row.workspaceId),
    topic_id: String(row.topicId),
    created_by: String(row.createdBy),
    role: row.role,
    permissions: row.permissions || {},
    label: row.label || null,
    status: row.status,
    expires_at: row.expiresAt || null,
    max_uses: row.maxUses ?? null,
    used_count: row.usedCount ?? 0,
    allow_anonymous_name: row.allowAnonymousName !== false,
    require_name: Boolean(row.requireName),
    require_email: Boolean(row.requireEmail),
    password_enabled: Boolean(row.passwordEnabled),
    last_used_at: row.lastUsedAt || null,
    revoked_at: row.revokedAt || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toRequirementDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    topic_id: String(row.topicId),
    title: row.title,
    description: row.description || null,
    status: row.status,
    priority: row.priority || 'medium',
    version: row.version ?? 1,
    parent_requirement_id: row.parentRequirementId ? String(row.parentRequirementId) : null,
    created_by: String(row.createdBy),
    approved_by: row.approvedBy ? String(row.approvedBy) : null,
    approved_at: row.approvedAt || null,
    locked_by: row.lockedBy ? String(row.lockedBy) : null,
    locked_at: row.lockedAt || null,
    locked_version: row.lockedVersion ?? null,
    change_reason: row.changeReason || null,
    source_review_item_id: row.sourceReviewItemId ? String(row.sourceReviewItemId) : null,
    linked_decision_ids: (row.linkedDecisionIds || []).map(String),
    linked_task_ids: (row.linkedTaskIds || []).map(String),
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toRequirementVersionDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    requirement_id: String(row.requirementId),
    topic_id: String(row.topicId),
    version: row.version,
    title: row.title,
    description: row.description || null,
    status: row.status,
    priority: row.priority || 'medium',
    change_reason: row.changeReason || null,
    created_by: String(row.createdBy),
    created_at: row.createdAt || null,
  };
}

function toQuestionDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    topic_id: String(row.topicId),
    question: row.question,
    answer: row.answer || null,
    status: row.status,
    owner_id: String(row.ownerId),
    linked_messages: (row.linkedMessages || []).map(String),
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toDecisionDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    topic_id: String(row.topicId),
    title: row.title,
    context: row.context || null,
    impact: row.impact || null,
    status: row.status,
    owner_id: String(row.ownerId),
    version: row.version ?? 1,
    parent_decision_id: row.parentDecisionId ? String(row.parentDecisionId) : null,
    approved_by: row.approvedBy ? String(row.approvedBy) : null,
    approved_at: row.approvedAt || null,
    locked_by: row.lockedBy ? String(row.lockedBy) : null,
    locked_at: row.lockedAt || null,
    change_reason: row.changeReason || null,
    source_review_item_id: row.sourceReviewItemId ? String(row.sourceReviewItemId) : null,
    linked_requirements: (row.linkedRequirements || []).map(String),
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toDecisionVersionDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    decision_id: String(row.decisionId),
    topic_id: String(row.topicId),
    version: row.version,
    title: row.title,
    context: row.context || null,
    impact: row.impact || null,
    status: row.status,
    change_reason: row.changeReason || null,
    created_by: String(row.createdBy),
    created_at: row.createdAt || null,
  };
}

function toDocumentDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    tenant_id: String(row.tenantId),
    workspace_id: String(row.workspaceId),
    topic_id: String(row.topicId),
    title: row.title,
    slug: row.slug,
    document_type: row.documentType,
    status: row.status,
    content: row.content || '',
    content_format: row.contentFormat || 'markdown',
    version: row.version ?? 1,
    parent_document_id: row.parentDocumentId ? String(row.parentDocumentId) : null,
    source: row.source || 'manual',
    source_ai_job_id: row.sourceAiJobId ? String(row.sourceAiJobId) : null,
    linked_requirement_ids: (row.linkedRequirementIds || []).map(String),
    linked_decision_ids: (row.linkedDecisionIds || []).map(String),
    linked_question_ids: (row.linkedQuestionIds || []).map(String),
    linked_message_ids: (row.linkedMessageIds || []).map(String),
    created_by: String(row.createdBy),
    updated_by: row.updatedBy ? String(row.updatedBy) : null,
    reviewed_by: row.reviewedBy ? String(row.reviewedBy) : null,
    reviewed_at: row.reviewedAt || null,
    locked_by: row.lockedBy ? String(row.lockedBy) : null,
    locked_at: row.lockedAt || null,
    change_reason: row.changeReason || null,
    metadata: row.metadata || {},
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toDocumentVersionDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    document_id: String(row.documentId),
    topic_id: String(row.topicId),
    version: row.version,
    title: row.title,
    content: row.content || '',
    content_format: row.contentFormat || 'markdown',
    status: row.status,
    change_reason: row.changeReason || null,
    created_by: String(row.createdBy),
    created_at: row.createdAt || null,
  };
}

function toImportBatchDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    tenant_id: String(row.tenantId),
    workspace_id: String(row.workspaceId),
    topic_id: String(row.topicId),
    created_by: String(row.createdBy),
    actor_type: row.actorType || 'user',
    source_type: row.sourceType,
    raw_text_preview: row.rawTextPreview || null,
    message_count: row.messageCount ?? 0,
    participant_count: row.participantCount ?? 0,
    status: row.status,
    ai_job_id: row.aiJobId ? String(row.aiJobId) : null,
    summary_id: row.summaryId ? String(row.summaryId) : null,
    stats: row.stats || {},
    error: row.error || null,
    completed_at: row.completedAt || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toAiReviewItemDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    tenant_id: String(row.tenantId),
    workspace_id: String(row.workspaceId),
    topic_id: String(row.topicId),
    import_batch_id: row.importBatchId ? String(row.importBatchId) : null,
    message_id: row.messageId ? String(row.messageId) : null,
    type: row.type,
    title: row.title || null,
    content: row.content || null,
    reasoning: row.reasoning || null,
    confidence: row.confidence ?? null,
    status: row.status,
    suggested_priority: row.suggestedPriority || 'medium',
    suggested_owner_id: row.suggestedOwnerId ? String(row.suggestedOwnerId) : null,
    linked_message_ids: (row.linkedMessageIds || []).map(String),
    approved_entity_id: row.approvedEntityId ? String(row.approvedEntityId) : null,
    created_by_ai_job_id: row.createdByAiJobId ? String(row.createdByAiJobId) : null,
    reviewed_by: row.reviewedBy ? String(row.reviewedBy) : null,
    reviewed_at: row.reviewedAt || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toAiJobSummaryDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    action: row.action,
    status: row.status,
    progress: row.progress ?? 0,
    source_module: row.sourceModule,
    source_id: row.sourceId || null,
    created_at: row.createdAt || null,
    completed_at: row.completedAt || null,
  };
}

function toHandoffDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    tenant_id: String(row.tenantId),
    workspace_id: String(row.workspaceId),
    topic_id: String(row.topicId),
    source_type: row.sourceType,
    source_id: String(row.sourceId),
    target_module: row.targetModule,
    target_id: row.targetId ? String(row.targetId) : null,
    status: row.status,
    payload: row.payload || {},
    created_by: String(row.createdBy),
    processed_by: row.processedBy ? String(row.processedBy) : null,
    error: row.error || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toTimelineDto(doc) {
  const row = baseDto(doc);
  if (!row) return null;
  return {
    id: String(row._id),
    topic_id: String(row.topicId),
    event_type: row.eventType,
    actor_id: row.actorId ? String(row.actorId) : null,
    payload: row.payload || {},
    created_at: row.createdAt || null,
  };
}

module.exports = {
  toWorkspaceDto,
  toTopicDto,
  toTopicMemberDto,
  toMessageDto,
  toGuestLinkDto,
  toRequirementDto,
  toRequirementVersionDto,
  toQuestionDto,
  toDecisionDto,
  toDecisionVersionDto,
  toDocumentDto,
  toDocumentVersionDto,
  toImportBatchDto,
  toAiReviewItemDto,
  toAiJobSummaryDto,
  toHandoffDto,
  toTimelineDto,
};
