const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { WORK_CATEGORY_STATUSES } = require('../constants/activity.constants');

const WorkCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, lowercase: true, unique: true },
    description: { type: String, default: null, trim: true },
    color: { type: String, default: null },
    icon: { type: String, default: null },
    status: {
      type: String,
      enum: WORK_CATEGORY_STATUSES,
      default: 'active',
    },
    isDefault: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  {
    collection: 'pts_work_categories',
    timestamps: true,
  }
);

WorkCategorySchema.index({ status: 1, sortOrder: 1 });

async function ensureWorkCategoryIndexes() {
  const WorkCategory = getV2Model('PtsWorkCategory', WorkCategorySchema);
  await WorkCategory.createIndexes();
  return WorkCategory;
}

module.exports = {
  WorkCategorySchema,
  ensureWorkCategoryIndexes,
  getWorkCategoryModel: () => getV2Model('PtsWorkCategory', WorkCategorySchema),
};
