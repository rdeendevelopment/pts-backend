const { sendSuccess } = require('../../../kernel/responses');
const aiReviewItemService = require('../services/aiReviewItem.service');

async function listReviewItems(req, res) {
  const data = await aiReviewItemService.listReviewItems(req.dfActor, req.params.id, req.query);
  return sendSuccess(res, data);
}

async function updateReviewItem(req, res) {
  const data = await aiReviewItemService.updateReviewItem(req.dfActor, req.params.id, req.body);
  return sendSuccess(res, data);
}

async function approveReviewItem(req, res) {
  const data = await aiReviewItemService.approveReviewItem(req.dfActor, req.params.id);
  return sendSuccess(res, data);
}

async function dismissReviewItem(req, res) {
  const data = await aiReviewItemService.dismissReviewItem(req.dfActor, req.params.id);
  return sendSuccess(res, data);
}

async function createDocumentDraft(req, res) {
  const data = await aiReviewItemService.createDocumentDraftFromReviewItem(req.dfActor, req.params.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function bulkApproveReviewItems(req, res) {
  const data = await aiReviewItemService.bulkApproveReviewItems(req.dfActor, req.params.id, req.body);
  return sendSuccess(res, data);
}

async function bulkDismissReviewItems(req, res) {
  const data = await aiReviewItemService.bulkDismissReviewItems(req.dfActor, req.params.id, req.body);
  return sendSuccess(res, data);
}

module.exports = {
  listReviewItems,
  updateReviewItem,
  approveReviewItem,
  dismissReviewItem,
  createDocumentDraft,
  bulkApproveReviewItems,
  bulkDismissReviewItems,
};
