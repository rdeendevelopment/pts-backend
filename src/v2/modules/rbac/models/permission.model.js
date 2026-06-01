const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { PERMISSION_CATEGORIES, PERMISSION_STATUSES } = require('../constants/rbac.constants');

const PermissionSchema = new Schema(
  {
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsModule',
      required: true,
      index: true,
    },
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
      enum: PERMISSION_CATEGORIES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: PERMISSION_STATUSES,
      default: 'active',
      index: true,
    },
    isSystem: { type: Boolean, default: false, index: true },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_permissions',
    timestamps: true,
  }
);

PermissionSchema.index(
  { key: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensurePermissionIndexes() {
  const Permission = getV2Model('PtsPermission', PermissionSchema);
  await Permission.createIndexes();
  return Permission;
}

module.exports = {
  PermissionSchema,
  ensurePermissionIndexes,
  getPermissionModel: () => getV2Model('PtsPermission', PermissionSchema),
};
