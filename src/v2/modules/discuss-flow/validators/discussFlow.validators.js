const { body, param, query } = require('express-validator');
const {
  WORKSPACE_VISIBILITY,
  WORKSPACE_STATUS,
  TOPIC_STATUS,
  TOPIC_PRIORITY,
  MESSAGE_TYPES,
  GUEST_ROLES,
  IMPORT_SOURCE_TYPES,
  AI_REVIEW_ITEM_TYPES,
  AI_REVIEW_ITEM_STATUS,
  SEARCH_ENTITY_TYPES,
  DOCUMENT_TYPES,
  DOCUMENT_CONTENT_FORMAT,
  DOCUMENT_SOURCE,
} = require('../constants/discussFlow.constants');

const workspaceIdParamRules = [
  param('id').isString().notEmpty().withMessage('workspace id is required'),
];

const topicIdParamRules = [
  param('id').isString().notEmpty().withMessage('topic id is required'),
];

const messageIdParamRules = [
  ...topicIdParamRules,
  param('messageId').isString().notEmpty().withMessage('message id is required'),
];

const guestLinkIdParamRules = [
  param('id').isString().notEmpty().withMessage('guest link id is required'),
];

const guestTokenParamRules = [
  param('token').isString().notEmpty().withMessage('guest token is required'),
];

const aiReviewItemIdParamRules = [
  param('id').isString().notEmpty().withMessage('ai review item id is required'),
];

const documentIdParamRules = [
  param('documentId').isString().notEmpty().withMessage('document id is required'),
];

const entityIdParamRules = [
  param('id').isString().notEmpty().withMessage('entity id is required'),
];

const changeReasonRules = [
  body('change_reason').optional().isString(),
  body('changeReason').optional().isString(),
];

const createWorkspaceRules = [
  body('name').trim().notEmpty().withMessage('name is required'),
  body('slug').optional().isString(),
  body('description').optional({ nullable: true }).isString(),
  body('icon').optional({ nullable: true }).isString(),
  body('visibility').optional().isIn(WORKSPACE_VISIBILITY),
];

const updateWorkspaceRules = [
  ...workspaceIdParamRules,
  body('name').optional().trim().notEmpty(),
  body('description').optional({ nullable: true }).isString(),
  body('icon').optional({ nullable: true }).isString(),
  body('visibility').optional().isIn(WORKSPACE_VISIBILITY),
  body('status').optional().isIn(WORKSPACE_STATUS),
];

const createTopicRules = [
  body('workspace_id').optional().isString(),
  body('workspaceId').optional().isString(),
  body('title').trim().notEmpty().withMessage('title is required'),
  body('description').optional({ nullable: true }).isString(),
  body('priority').optional().isIn(TOPIC_PRIORITY),
  body('category').optional({ nullable: true }).isString(),
  body('tags').optional().isArray(),
  body().custom((_, { req }) => {
    if (!req.body.workspace_id && !req.body.workspaceId) {
      throw new Error('workspace_id is required');
    }
    return true;
  }),
];

const updateTopicRules = [
  ...topicIdParamRules,
  body('title').optional().trim().notEmpty(),
  body('description').optional({ nullable: true }).isString(),
  body('status').optional().isIn(TOPIC_STATUS),
  body('priority').optional().isIn(TOPIC_PRIORITY),
  body('category').optional({ nullable: true }).isString(),
  body('tags').optional().isArray(),
];

const createMessageRules = [
  body('content').trim().notEmpty().withMessage('content is required'),
  body('message_type').optional().isIn(MESSAGE_TYPES),
  body('messageType').optional().isIn(MESSAGE_TYPES),
];

const updateMessageRules = [
  body('content').trim().notEmpty().withMessage('content is required'),
];

const replyMessageRules = [
  body('content').trim().notEmpty().withMessage('content is required'),
];

const createGuestLinkRules = [
  body('topic_id').optional().isString(),
  body('topicId').optional().isString(),
  body('role').optional().isIn(GUEST_ROLES),
  body('label').optional({ nullable: true }).isString(),
  body('password').optional({ nullable: true }).isString(),
  body('expires_at').optional({ nullable: true }),
  body('expiresAt').optional({ nullable: true }),
  body('max_uses').optional().isInt({ min: 1 }),
  body('maxUses').optional().isInt({ min: 1 }),
  body().custom((_, { req }) => {
    if (!req.body.topic_id && !req.body.topicId) {
      throw new Error('topic_id is required');
    }
    return true;
  }),
];

const joinGuestRules = [
  body('name').optional({ nullable: true }).isString(),
  body('email').optional({ nullable: true }).isString(),
  body('password').optional({ nullable: true }).isString(),
];

const importChatRules = [
  body('raw_text').optional().isString(),
  body('rawText').optional().isString(),
  body('source_type').optional().isIn(IMPORT_SOURCE_TYPES),
  body('sourceType').optional().isIn(IMPORT_SOURCE_TYPES),
  body('run_ai_extraction').optional().isBoolean(),
  body('runAiExtraction').optional().isBoolean(),
  body().custom((_, { req }) => {
    if (!req.body.raw_text && !req.body.rawText) {
      throw new Error('raw_text is required');
    }
    return true;
  }),
];

const listAiReviewQueryRules = [
  query('type').optional().isIn(AI_REVIEW_ITEM_TYPES),
  query('status').optional().isIn(AI_REVIEW_ITEM_STATUS),
  query('import_batch_id').optional().isString(),
  query('importBatchId').optional().isString(),
  query('message_id').optional().isString(),
  query('messageId').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
];

const updateAiReviewItemRules = [
  body('title').optional().trim().notEmpty(),
  body('content').optional().isString(),
  body('suggested_priority').optional().isIn(TOPIC_PRIORITY),
  body('suggestedPriority').optional().isIn(TOPIC_PRIORITY),
];

const createRequirementRules = [
  ...topicIdParamRules,
  body('title').trim().notEmpty().withMessage('title is required'),
  body('description').optional({ nullable: true }).isString(),
  body('priority').optional().isIn(TOPIC_PRIORITY),
];

const createQuestionRules = [
  ...topicIdParamRules,
  body('question').trim().notEmpty().withMessage('question is required'),
  body('answer').optional({ nullable: true }).isString(),
];

const createDecisionRules = [
  ...topicIdParamRules,
  body('title').trim().notEmpty().withMessage('title is required'),
  body('context').optional({ nullable: true }).isString(),
  body('impact').optional({ nullable: true }).isString(),
];

const createDocumentRules = [
  ...topicIdParamRules,
  body('title').trim().notEmpty().withMessage('title is required'),
  body('document_type').optional().isIn(DOCUMENT_TYPES),
  body('documentType').optional().isIn(DOCUMENT_TYPES),
  body('content').optional().isString(),
  body('content_format').optional().isIn(DOCUMENT_CONTENT_FORMAT),
  body('contentFormat').optional().isIn(DOCUMENT_CONTENT_FORMAT),
  body('source').optional().isIn(DOCUMENT_SOURCE),
  body('linked_requirement_ids').optional().isArray(),
  body('linkedRequirementIds').optional().isArray(),
  body('linked_decision_ids').optional().isArray(),
  body('linkedDecisionIds').optional().isArray(),
];

const updateDocumentRules = [
  ...documentIdParamRules,
  body('title').optional().trim().notEmpty(),
  body('content').optional().isString(),
  body('linked_requirement_ids').optional().isArray(),
  body('linkedRequirementIds').optional().isArray(),
  body('linked_decision_ids').optional().isArray(),
  body('linkedDecisionIds').optional().isArray(),
];

const generateDocumentRules = [
  ...topicIdParamRules,
  body('document_type').optional().isIn(DOCUMENT_TYPES),
  body('documentType').optional().isIn(DOCUMENT_TYPES),
  body('instructions').optional().isString(),
  body('requirement_ids').optional().isArray(),
  body('requirementIds').optional().isArray(),
  body('decision_ids').optional().isArray(),
  body('decisionIds').optional().isArray(),
  body('question_ids').optional().isArray(),
  body('questionIds').optional().isArray(),
  body('message_ids').optional().isArray(),
  body('messageIds').optional().isArray(),
];

const listQueryRules = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('sort').optional().isString(),
  query('q').optional().isString(),
  query('search').optional().isString(),
];

const searchQueryRules = [
  query('q').trim().notEmpty().withMessage('q is required'),
  query('workspace_id').optional().isString(),
  query('workspaceId').optional().isString(),
  query('type').optional().isIn(SEARCH_ENTITY_TYPES),
  query('status').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
];

const bulkAiReviewRules = [
  ...topicIdParamRules,
  body('item_ids').optional().isArray(),
  body('itemIds').optional().isArray(),
  body('type').optional().isIn(AI_REVIEW_ITEM_TYPES),
  body().custom((_, { req }) => {
    if (!req.body.item_ids?.length && !req.body.itemIds?.length) {
      throw new Error('itemIds is required');
    }
    return true;
  }),
];

const handoffTaskRules = [
  body('project_id').optional().isString(),
  body('projectId').optional().isString(),
  body('tags').optional().isArray(),
];

const handoffProjectBriefRules = [
  body('notes').optional().isString(),
];

module.exports = {
  workspaceIdParamRules,
  topicIdParamRules,
  messageIdParamRules,
  guestLinkIdParamRules,
  guestTokenParamRules,
  createWorkspaceRules,
  updateWorkspaceRules,
  createTopicRules,
  updateTopicRules,
  createMessageRules,
  updateMessageRules,
  replyMessageRules,
  createGuestLinkRules,
  joinGuestRules,
  importChatRules,
  listAiReviewQueryRules,
  updateAiReviewItemRules,
  aiReviewItemIdParamRules,
  documentIdParamRules,
  entityIdParamRules,
  changeReasonRules,
  createDocumentRules,
  updateDocumentRules,
  generateDocumentRules,
  searchQueryRules,
  bulkAiReviewRules,
  handoffTaskRules,
  handoffProjectBriefRules,
  createRequirementRules,
  createQuestionRules,
  createDecisionRules,
  listQueryRules,
};
