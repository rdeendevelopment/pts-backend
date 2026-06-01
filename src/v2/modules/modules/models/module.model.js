const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { MODULE_CATEGORIES, MODULE_STATUSES } = require('../constants/module.constants');

const ModuleSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: MODULE_CATEGORIES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: MODULE_STATUSES,
      default: 'active',
      index: true,
    },
    sortOrder: { type: Number, default: 0, index: true },
    icon: { type: String, default: null },
    routeBase: { type: String, default: null },
    isSystem: { type: Boolean, default: false, index: true },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_modules',
    timestamps: true,
  }
);

ModuleSchema.index(
  { key: 1 },
  {
    unique: true,
    name: 'pts_modules_key_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensureModuleIndexes() {
  const Module = getV2Model('PtsModule', ModuleSchema);
  await Module.createIndexes();
  return Module;
}

module.exports = {
  ModuleSchema,
  ensureModuleIndexes,
  getModuleModel: () => getV2Model('PtsModule', ModuleSchema),
};
