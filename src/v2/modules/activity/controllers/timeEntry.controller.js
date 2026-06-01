const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const timeEntryService = require('../services/timeEntry.service');

async function listEntries(req, res) {
  const data = await timeEntryService.listEntries(req.query, req);
  return sendSuccess(res, { items: data });
}

async function getEntryById(req, res) {
  const entryId = assertObjectId(req.params.id, 'id');
  const data = await timeEntryService.getEntryById(entryId, req);
  return sendSuccess(res, data);
}

async function createEntry(req, res) {
  const body = { ...req.body };
  body.projectId = assertObjectId(body.projectId, 'projectId');
  body.workCategoryId = assertObjectId(body.workCategoryId, 'workCategoryId');
  if (body.budgetId) body.budgetId = assertObjectId(body.budgetId, 'budgetId');
  if (body.timeWeekId) body.timeWeekId = assertObjectId(body.timeWeekId, 'timeWeekId');
  if (body.userId) body.userId = assertObjectId(body.userId, 'userId');

  const data = await timeEntryService.createEntry(body, req.v2Auth.accountId, req);
  return sendSuccess(res, data, { status: 201 });
}

async function updateEntry(req, res) {
  const entryId = assertObjectId(req.params.id, 'id');
  const body = { ...req.body };
  if (body.workCategoryId) body.workCategoryId = assertObjectId(body.workCategoryId, 'workCategoryId');
  if (body.budgetId) body.budgetId = assertObjectId(body.budgetId, 'budgetId');

  const data = await timeEntryService.updateEntry(entryId, body, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function deleteEntry(req, res) {
  const entryId = assertObjectId(req.params.id, 'id');
  const data = await timeEntryService.deleteEntry(entryId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function validateTimeEntry(req, res) {
  const body = { ...req.body };
  body.projectId = assertObjectId(body.projectId, 'projectId');
  body.workCategoryId = assertObjectId(body.workCategoryId, 'workCategoryId');
  if (body.budgetId) body.budgetId = assertObjectId(body.budgetId, 'budgetId');
  if (body.timeWeekId) body.timeWeekId = assertObjectId(body.timeWeekId, 'timeWeekId');
  if (body.userId) body.userId = assertObjectId(body.userId, 'userId');

  const data = await timeEntryService.previewValidation(body, req);
  return sendSuccess(res, data);
}

module.exports = {
  listEntries: asyncHandler(listEntries),
  getEntryById: asyncHandler(getEntryById),
  createEntry: asyncHandler(createEntry),
  updateEntry: asyncHandler(updateEntry),
  deleteEntry: asyncHandler(deleteEntry),
  validateTimeEntry: asyncHandler(validateTimeEntry),
};
