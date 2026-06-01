const workCategoryRepository = require('../repositories/workCategory.repository');
const { toWorkCategoryDto } = require('../dto/activity.dto');

async function listWorkCategories() {
  const categories = await workCategoryRepository.listCategories({ activeOnly: true });
  return categories.map(toWorkCategoryDto);
}

async function seedWorkCategories() {
  return workCategoryRepository.seedDefaultCategories();
}

module.exports = {
  listWorkCategories,
  seedWorkCategories,
};
