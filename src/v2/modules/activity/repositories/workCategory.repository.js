const { getWorkCategoryModel } = require('../models/workCategory.model');
const { DEFAULT_WORK_CATEGORIES } = require('../constants/activity.constants');

async function listCategories({ activeOnly = true } = {}) {
  const WorkCategory = getWorkCategoryModel();
  const query = {};
  if (activeOnly) query.status = 'active';
  return WorkCategory.find(query).sort({ sortOrder: 1, name: 1 }).exec();
}

async function findById(categoryId) {
  const WorkCategory = getWorkCategoryModel();
  return WorkCategory.findById(categoryId).exec();
}

async function findByCode(code) {
  const WorkCategory = getWorkCategoryModel();
  return WorkCategory.findOne({ code: String(code).trim().toLowerCase() }).exec();
}

async function seedDefaultCategories() {
  const WorkCategory = getWorkCategoryModel();
  const results = { created: [], updated: [] };

  for (const item of DEFAULT_WORK_CATEGORIES) {
    const existing = await findByCode(item.code);
    if (existing) {
      existing.name = item.name;
      existing.sortOrder = item.sortOrder;
      existing.isDefault = Boolean(item.isDefault);
      existing.status = 'active';
      await existing.save();
      results.updated.push(item.code);
    } else {
      await WorkCategory.create({
        ...item,
        code: item.code.toLowerCase(),
        status: 'active',
      });
      results.created.push(item.code);
    }
  }

  return results;
}

async function findNamesByIds(categoryIds = []) {
  if (!categoryIds.length) return [];
  const WorkCategory = getWorkCategoryModel();
  return WorkCategory.find({ _id: { $in: categoryIds } })
    .select('_id name')
    .lean();
}

module.exports = {
  listCategories,
  findById,
  findByCode,
  findNamesByIds,
  seedDefaultCategories,
};
