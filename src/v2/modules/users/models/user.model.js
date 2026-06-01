const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { USER_STATUSES, EMPLOYMENT_TYPES, DEFAULT_TIMEZONE } = require('../constants/users.constants');

const UserSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      required: true,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: { type: String, default: null, required: false },
    avatarUrl: { type: String, default: null },
    jobTitle: { type: String, default: null },
    department: { type: String, default: null, index: true },
    employmentType: {
      type: String,
      enum: EMPLOYMENT_TYPES,
      default: 'full_time',
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: 'active',
      index: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      default: null,
      index: true,
    },
    joiningDate: { type: Date, default: null },
    timezone: { type: String, default: DEFAULT_TIMEZONE },
    notes: { type: String, default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_users',
    timestamps: true,
  }
);

UserSchema.index(
  { accountId: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);

UserSchema.index({ email: 1, isDeleted: 1 });
UserSchema.index(
  { username: 1, isDeleted: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, username: { $type: 'string', $ne: null } },
  }
);
UserSchema.index({ createdAt: -1, _id: -1 });

async function ensureUserIndexes() {
  const User = getV2Model('PtsUser', UserSchema);
  await User.createIndexes();
  return User;
}

module.exports = {
  UserSchema,
  ensureUserIndexes,
  getUserModel: () => getV2Model('PtsUser', UserSchema),
};
