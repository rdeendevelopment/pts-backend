const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { asyncHandler } = require('../../kernel/middleware');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const requireSystemModule = require('../modules/middleware/requireSystemModule');
const authenticateGuestSession = require('./middleware/authenticateGuestSession');
const resolveDiscussFlowActor = require('./middleware/resolveDiscussFlowActor');

const workspaceController = require('./controllers/workspace.controller');
const topicController = require('./controllers/topic.controller');
const messageController = require('./controllers/message.controller');
const requirementController = require('./controllers/requirement.controller');
const questionController = require('./controllers/question.controller');
const decisionController = require('./controllers/decision.controller');
const timelineController = require('./controllers/timeline.controller');
const guestLinkController = require('./controllers/guestLink.controller');
const guestController = require('./controllers/guest.controller');
const panelController = require('./controllers/panel.controller');
const importChatController = require('./controllers/importChat.controller');
const aiReviewItemController = require('./controllers/aiReviewItem.controller');
const documentController = require('./controllers/document.controller');
const handoffController = require('./controllers/handoff.controller');
const searchController = require('./controllers/search.controller');
const resumeController = require('./controllers/resume.controller');
const aiUsageController = require('./controllers/aiUsage.controller');

const {
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
  createRequirementRules,
  createQuestionRules,
  createDecisionRules,
  createGuestLinkRules,
  joinGuestRules,
  importChatRules,
  listAiReviewQueryRules,
  updateAiReviewItemRules,
  aiReviewItemIdParamRules,
  documentIdParamRules,
  createDocumentRules,
  updateDocumentRules,
  generateDocumentRules,
  entityIdParamRules,
  changeReasonRules,
  searchQueryRules,
  bulkAiReviewRules,
  handoffTaskRules,
  handoffProjectBriefRules,
  listQueryRules,
} = require('./validators/discussFlow.validators');

const router = Router();

// Public guest routes — no PTS dashboard auth
router.get('/guest/:token/preview', guestTokenParamRules, validateRequest, asyncHandler(guestController.previewGuestLink));
router.post('/guest/:token/join', guestTokenParamRules, joinGuestRules, validateRequest, asyncHandler(guestController.joinGuestLink));

// Guest session routes — guest JWT only
router.get('/guest/session', authenticateGuestSession, asyncHandler(guestController.getGuestSession));
router.post('/guest/session/messages', authenticateGuestSession, createMessageRules, validateRequest, asyncHandler(guestController.sendGuestMessage));

const canView = authorize(['discuss_flow.view', 'discuss_flow.manage'], { mode: 'any' });
const canManage = authorize('discuss_flow.manage');

router.use(authenticate);
router.use(requireSystemModule('discuss_flow'));

router.post('/guest-links', canManage, createGuestLinkRules, validateRequest, asyncHandler(guestLinkController.createGuestLink));
router.patch('/guest-links/:id/revoke', canManage, guestLinkIdParamRules, validateRequest, asyncHandler(guestLinkController.revokeGuestLink));

router.post('/workspaces', canManage, createWorkspaceRules, validateRequest, asyncHandler(workspaceController.createWorkspace));
router.get('/search', canView, searchQueryRules, validateRequest, asyncHandler(searchController.searchDiscussFlow));

router.get('/workspaces', canView, listQueryRules, validateRequest, asyncHandler(workspaceController.listWorkspaces));
router.get('/workspaces/:id', canView, workspaceIdParamRules, validateRequest, asyncHandler(workspaceController.getWorkspace));
router.patch('/workspaces/:id', canManage, updateWorkspaceRules, validateRequest, asyncHandler(workspaceController.updateWorkspace));

router.post('/topics', canManage, createTopicRules, validateRequest, asyncHandler(topicController.createTopic));
router.get('/topics', canView, listQueryRules, validateRequest, asyncHandler(topicController.listTopics));
router.get('/topics/:id', canView, topicIdParamRules, validateRequest, asyncHandler(topicController.getTopic));
router.patch('/topics/:id', canManage, updateTopicRules, validateRequest, asyncHandler(topicController.updateTopic));

router.get(
  '/topics/:id/panel',
  canView,
  topicIdParamRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(panelController.getTopicPanel)
);
router.get(
  '/topics/:id/resume',
  canView,
  topicIdParamRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(resumeController.resumeTopic)
);
router.get(
  '/topics/:id/ai-usage',
  canView,
  topicIdParamRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(aiUsageController.getTopicAiUsage)
);

router.post(
  '/topics/:id/import-chat',
  canManage,
  topicIdParamRules,
  importChatRules,
  validateRequest,
  asyncHandler(importChatController.importChat)
);

router.get(
  '/topics/:id/ai-review-items',
  canView,
  topicIdParamRules,
  resolveDiscussFlowActor,
  listAiReviewQueryRules,
  validateRequest,
  asyncHandler(aiReviewItemController.listReviewItems)
);
router.post(
  '/topics/:id/ai-review-items/bulk-approve',
  canManage,
  bulkAiReviewRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(aiReviewItemController.bulkApproveReviewItems)
);
router.post(
  '/topics/:id/ai-review-items/bulk-dismiss',
  canManage,
  bulkAiReviewRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(aiReviewItemController.bulkDismissReviewItems)
);

router.post(
  '/topics/:id/messages',
  canManage,
  topicIdParamRules,
  createMessageRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(messageController.createMessage)
);
router.get(
  '/topics/:id/messages',
  canView,
  topicIdParamRules,
  resolveDiscussFlowActor,
  listQueryRules,
  validateRequest,
  asyncHandler(messageController.listMessages)
);
router.patch(
  '/topics/:id/messages/:messageId',
  canManage,
  messageIdParamRules,
  updateMessageRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(messageController.updateMessage)
);
router.delete(
  '/topics/:id/messages/:messageId',
  canManage,
  messageIdParamRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(messageController.deleteMessage)
);
router.post(
  '/topics/:id/messages/:messageId/reply',
  canManage,
  messageIdParamRules,
  replyMessageRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(messageController.replyToMessage)
);
router.get(
  '/topics/:id/messages/:messageId/ai-suggestions',
  canView,
  messageIdParamRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(messageController.getAiSuggestions)
);
router.post(
  '/topics/:id/messages/:messageId/ai-analyze',
  canManage,
  messageIdParamRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(messageController.analyzeMessage)
);

router.patch(
  '/ai-review-items/:id',
  canManage,
  aiReviewItemIdParamRules,
  resolveDiscussFlowActor,
  updateAiReviewItemRules,
  validateRequest,
  asyncHandler(aiReviewItemController.updateReviewItem)
);
router.post(
  '/ai-review-items/:id/approve',
  canManage,
  aiReviewItemIdParamRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(aiReviewItemController.approveReviewItem)
);
router.post(
  '/ai-review-items/:id/dismiss',
  canManage,
  aiReviewItemIdParamRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(aiReviewItemController.dismissReviewItem)
);
router.post(
  '/ai-review-items/:id/create-document-draft',
  canManage,
  aiReviewItemIdParamRules,
  resolveDiscussFlowActor,
  validateRequest,
  asyncHandler(aiReviewItemController.createDocumentDraft)
);
router.post(
  '/ai-review-items/:id/create-task-candidate',
  canManage,
  aiReviewItemIdParamRules,
  handoffTaskRules,
  validateRequest,
  asyncHandler(handoffController.createTaskFromReviewItem)
);

router.post('/topics/:id/documents', canManage, topicIdParamRules, createDocumentRules, validateRequest, asyncHandler(documentController.createDocument));
router.get('/topics/:id/documents', canView, topicIdParamRules, listQueryRules, validateRequest, asyncHandler(documentController.listDocuments));
router.post('/topics/:id/documents/generate', canManage, topicIdParamRules, generateDocumentRules, validateRequest, asyncHandler(documentController.generateDocument));

router.get('/documents/:documentId', canView, documentIdParamRules, validateRequest, asyncHandler(documentController.getDocument));
router.patch('/documents/:documentId', canManage, documentIdParamRules, updateDocumentRules, validateRequest, asyncHandler(documentController.updateDocument));
router.post('/documents/:documentId/submit-review', canManage, documentIdParamRules, validateRequest, asyncHandler(documentController.submitDocumentReview));
router.post('/documents/:documentId/lock', canManage, documentIdParamRules, changeReasonRules, validateRequest, asyncHandler(documentController.lockDocument));
router.post('/documents/:documentId/new-version', canManage, documentIdParamRules, changeReasonRules, validateRequest, asyncHandler(documentController.createDocumentNewVersion));
router.get('/documents/:documentId/versions', canView, documentIdParamRules, validateRequest, asyncHandler(documentController.listDocumentVersions));
router.post(
  '/documents/:documentId/create-project-brief',
  canManage,
  documentIdParamRules,
  handoffProjectBriefRules,
  validateRequest,
  asyncHandler(handoffController.createProjectBriefFromDocument)
);

router.post('/topics/:id/requirements', canManage, createRequirementRules, validateRequest, asyncHandler(requirementController.createRequirement));
router.get('/topics/:id/requirements', canView, topicIdParamRules, listQueryRules, validateRequest, asyncHandler(requirementController.listRequirements));
router.post('/requirements/:id/submit-review', canManage, entityIdParamRules, validateRequest, asyncHandler(requirementController.submitRequirementReview));
router.post('/requirements/:id/approve', canManage, entityIdParamRules, validateRequest, asyncHandler(requirementController.approveRequirement));
router.post('/requirements/:id/lock', canManage, entityIdParamRules, changeReasonRules, validateRequest, asyncHandler(requirementController.lockRequirement));
router.post('/requirements/:id/new-version', canManage, entityIdParamRules, changeReasonRules, validateRequest, asyncHandler(requirementController.createRequirementNewVersion));
router.get('/requirements/:id/versions', canView, entityIdParamRules, validateRequest, asyncHandler(requirementController.listRequirementVersions));
router.post(
  '/requirements/:id/create-task',
  canManage,
  entityIdParamRules,
  handoffTaskRules,
  validateRequest,
  asyncHandler(handoffController.createTaskFromRequirement)
);

router.post('/topics/:id/questions', canManage, createQuestionRules, validateRequest, asyncHandler(questionController.createQuestion));
router.get('/topics/:id/questions', canView, topicIdParamRules, listQueryRules, validateRequest, asyncHandler(questionController.listQuestions));

router.post('/topics/:id/decisions', canManage, createDecisionRules, validateRequest, asyncHandler(decisionController.createDecision));
router.get('/topics/:id/decisions', canView, topicIdParamRules, listQueryRules, validateRequest, asyncHandler(decisionController.listDecisions));
router.post('/decisions/:id/approve', canManage, entityIdParamRules, validateRequest, asyncHandler(decisionController.approveDecision));
router.post('/decisions/:id/lock', canManage, entityIdParamRules, changeReasonRules, validateRequest, asyncHandler(decisionController.lockDecision));
router.post('/decisions/:id/new-version', canManage, entityIdParamRules, changeReasonRules, validateRequest, asyncHandler(decisionController.createDecisionNewVersion));
router.get('/decisions/:id/versions', canView, entityIdParamRules, validateRequest, asyncHandler(decisionController.listDecisionVersions));

router.get('/topics/:id/timeline', canView, topicIdParamRules, listQueryRules, validateRequest, asyncHandler(timelineController.listTimeline));

module.exports = router;
