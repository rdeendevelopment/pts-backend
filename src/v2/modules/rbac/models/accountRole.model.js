const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { ACCOUNT_ROLE_STATUSES } = require('../constants/rbac.constants');

const AccountRoleSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      required: true,
      index: true,
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsRole',
      required: true,
      index: true,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      default: null,
    },
    assignedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ACCOUNT_ROLE_STATUSES,
      default: 'active',
      index: true,
    },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_account_roles',
    timestamps: true,
  }
);

AccountRoleSchema.index(
  { accountId: 1, roleId: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensureAccountRoleIndexes() {
  const AccountRole = getV2Model('PtsAccountRole', AccountRoleSchema);
  await AccountRole.createIndexes();
  return AccountRole;
}

module.exports = {
  AccountRoleSchema,
  ensureAccountRoleIndexes,
  getAccountRoleModel: () => getV2Model('PtsAccountRole', AccountRoleSchema),
};
