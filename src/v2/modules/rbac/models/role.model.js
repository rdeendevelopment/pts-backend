const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { ROLE_STATUSES } = require('../constants/rbac.constants');

const RoleSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ROLE_STATUSES,
      default: 'active',
      index: true,
    },
    isSystem: { type: Boolean, default: false, index: true },
    priority: { type: Number, default: 100, index: true },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_roles',
    timestamps: true,
  }
);

RoleSchema.index(
  { key: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensureRoleIndexes() {
  const Role = getV2Model('PtsRole', RoleSchema);
  await Role.createIndexes();
  return Role;
}

module.exports = {
  RoleSchema,
  ensureRoleIndexes,
  getRoleModel: () => getV2Model('PtsRole', RoleSchema),
};
