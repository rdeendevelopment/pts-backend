const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const workCategoryService = require('../services/workCategory.service');

async function listWorkCategories(_req, res) {
  const data = await workCategoryService.listWorkCategories();
  return sendSuccess(res, { items: data });
}

module.exports = {
  listWorkCategories: asyncHandler(listWorkCategories),
};
