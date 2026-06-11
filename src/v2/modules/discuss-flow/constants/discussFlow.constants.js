const MODULE_KEY = 'discuss_flow';

const WORKSPACE_VISIBILITY = ['private', 'team', 'organization'];
const WORKSPACE_STATUS = ['active', 'archived'];

const TOPIC_STATUS = ['draft', 'active', 'paused', 'resolved', 'archived'];
const TOPIC_PRIORITY = ['low', 'medium', 'high', 'critical'];
const TOPIC_CATEGORIES = ['product', 'engineering', 'design', 'operations', 'general'];

const TOPIC_MEMBER_ROLES = ['owner', 'manager', 'contributor', 'commenter', 'viewer'];

const GUEST_ROLES = ['viewer', 'commenter', 'contributor'];
const GUEST_LINK_STATUS = ['active', 'expired', 'revoked'];

const AUTHOR_TYPES = ['account', 'guest', 'system', 'imported'];

const IMPORT_SOURCE_TYPES = ['whatsapp', 'slack', 'email', 'meeting_transcript', 'manual_paste', 'other'];
const IMPORT_BATCH_STATUS = [
  'created',
  'parsing',
  'messages_saved',
  'ai_queued',
  'ai_running',
  'review_ready',
  'failed',
];

const AI_REVIEW_ITEM_TYPES = [
  'summary',
  'requirement',
  'question',
  'decision',
  'risk',
  'task_candidate',
  'next_action',
];
const AI_REVIEW_ITEM_STATUS = ['pending', 'approved', 'dismissed', 'edited', 'converted'];
const MESSAGE_TYPES = ['message', 'note', 'system', 'decision', 'requirement', 'question'];
const MESSAGE_SOURCES = ['manual', 'imported_whatsapp', 'imported_email', 'imported_slack', 'system', 'ai'];
const MESSAGE_STATUS = ['active', 'edited', 'deleted'];
const AI_SUGGESTION_STATUS = ['none', 'pending', 'ready', 'dismissed', 'accepted'];

const GUEST_ROLE_PERMISSIONS = {
  viewer: {
    readMessages: true,
    readRequirements: true,
    readQuestions: true,
    readDecisions: true,
    readDocuments: true,
    sendMessage: false,
    replyMessage: false,
    createRequirement: false,
    createQuestion: false,
    createDecision: false,
    createDraftDocument: false,
    submitForReview: false,
    approveOrLock: false,
  },
  commenter: {
    readMessages: true,
    readRequirements: true,
    readQuestions: true,
    readDecisions: true,
    readDocuments: true,
    sendMessage: true,
    replyMessage: true,
    createRequirement: false,
    createQuestion: false,
    createDecision: false,
    createDraftDocument: false,
    submitForReview: false,
    approveOrLock: false,
  },
  contributor: {
    readMessages: true,
    readRequirements: true,
    readQuestions: true,
    readDecisions: true,
    readDocuments: true,
    sendMessage: true,
    replyMessage: true,
    createRequirement: true,
    createQuestion: true,
    createDecision: true,
    createDraftDocument: true,
    submitForReview: true,
    approveOrLock: false,
  },
};

const DOCUMENT_TYPES = [
  'meeting_summary',
  'requirements_document',
  'brd',
  'prd',
  'scope',
  'proposal',
  'technical_notes',
  'client_notes',
  'custom',
];
const DOCUMENT_STATUS = ['draft', 'review', 'locked', 'archived'];
const DOCUMENT_CONTENT_FORMAT = ['markdown', 'html', 'plain_text', 'json'];
const DOCUMENT_SOURCE = ['manual', 'ai_generated', 'imported', 'system'];

const REQUIREMENT_STATUS = ['draft', 'review', 'approved', 'locked', 'archived'];
const QUESTION_STATUS = ['open', 'answered', 'blocked', 'archived'];
const DECISION_STATUS = ['draft', 'approved', 'locked', 'archived'];

const REQUIREMENT_TRANSITIONS = {
  draft: ['review'],
  review: ['approved'],
  approved: ['locked'],
  locked: [],
  archived: [],
};

const DECISION_TRANSITIONS = {
  draft: ['approved'],
  approved: ['locked'],
  locked: [],
  archived: [],
};

const DOCUMENT_TRANSITIONS = {
  draft: ['review'],
  review: ['locked'],
  locked: ['archived'],
  archived: [],
};

const TIMELINE_EVENT_TYPES = [
  'topic_created',
  'message_created',
  'message_updated',
  'message_deleted',
  'guest_message_created',
  'requirement_created',
  'question_created',
  'decision_created',
  'document_created',
  'task_created',
  'guest_link_created',
  'guest_link_revoked',
  'guest_joined_topic',
  'chat_imported',
  'import_batch_ai_ready',
  'import_batch_ai_failed',
  'ai_review_item_approved',
  'ai_review_item_dismissed',
  'document_generated',
  'document_review_submitted',
  'document_locked',
  'document_version_created',
  'requirement_review_submitted',
  'requirement_approved',
  'requirement_locked',
  'requirement_version_created',
  'decision_approved',
  'decision_locked',
  'decision_version_created',
  'truth_updated',
  'handoff_created',
  'handoff_completed',
  'handoff_failed',
];

const HANDOFF_SOURCE_TYPES = ['requirement', 'decision', 'document', 'ai_review_item'];
const HANDOFF_TARGET_MODULES = ['tasks', 'projects', 'crm', 'hrm'];
const HANDOFF_STATUS = ['pending', 'created', 'failed', 'skipped'];

const SEARCH_ENTITY_TYPES = ['topic', 'message', 'requirement', 'decision', 'document', 'all'];

const GUEST_SESSION_TTL = process.env.PTS_DF_GUEST_SESSION_TTL || '24h';
const GUEST_LINK_TOKEN_BYTES = 32;

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

module.exports = {
  MODULE_KEY,
  WORKSPACE_VISIBILITY,
  WORKSPACE_STATUS,
  TOPIC_STATUS,
  TOPIC_PRIORITY,
  TOPIC_CATEGORIES,
  TOPIC_MEMBER_ROLES,
  GUEST_ROLES,
  GUEST_LINK_STATUS,
  GUEST_ROLE_PERMISSIONS,
  AUTHOR_TYPES,
  IMPORT_SOURCE_TYPES,
  IMPORT_BATCH_STATUS,
  AI_REVIEW_ITEM_TYPES,
  AI_REVIEW_ITEM_STATUS,
  MESSAGE_TYPES,
  MESSAGE_SOURCES,
  MESSAGE_STATUS,
  AI_SUGGESTION_STATUS,
  GUEST_SESSION_TTL,
  GUEST_LINK_TOKEN_BYTES,
  DOCUMENT_TYPES,
  DOCUMENT_STATUS,
  DOCUMENT_CONTENT_FORMAT,
  DOCUMENT_SOURCE,
  REQUIREMENT_STATUS,
  REQUIREMENT_TRANSITIONS,
  QUESTION_STATUS,
  DECISION_STATUS,
  DECISION_TRANSITIONS,
  DOCUMENT_TRANSITIONS,
  TIMELINE_EVENT_TYPES,
  HANDOFF_SOURCE_TYPES,
  HANDOFF_TARGET_MODULES,
  HANDOFF_STATUS,
  SEARCH_ENTITY_TYPES,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
};
