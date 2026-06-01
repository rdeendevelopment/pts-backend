const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const RolePermissionSchema = new Schema(
  {
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsRole',
      required: true,
      index: true,
    },
    permissionId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsPermission',
      required: true,
      index: true,
    },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_role_permissions',
    timestamps: true,
  }
);

RolePermissionSchema.index(
  { roleId: 1, permissionId: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensureRolePermissionIndexes() {
  const RolePermission = getV2Model('PtsRolePermission', RolePermissionSchema);
  await RolePermission.createIndexes();
  return RolePermission;
}

module.exports = {
  RolePermissionSchema,
  ensureRolePermissionIndexes,
  getRolePermissionModel: () => getV2Model('PtsRolePermission', RolePermissionSchema),
};
