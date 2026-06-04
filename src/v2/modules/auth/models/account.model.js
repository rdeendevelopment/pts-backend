const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { ACCOUNT_STATUSES, ACCOUNT_TYPES } = require('../constants/auth.constants');

const SecuritySchema = new Schema(
  {
    passwordResetRequired: { type: Boolean, default: false },
    passwordMigrated: { type: Boolean, default: false },
  },
  { _id: false }
);

const AccountSchema = new Schema(
  {
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
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: 'active',
      index: true,
    },
    accountType: {
      type: String,
      enum: ACCOUNT_TYPES,
      default: 'employee',
      index: true,
    },
    /** Required when accountType is `client` — links portal login to a client org. */
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsClient',
      default: null,
      index: true,
    },
    lastLoginAt: { type: Date, default: null },
    security: { type: SecuritySchema, default: () => ({}) },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_accounts',
    timestamps: true,
  }
);

AccountSchema.index(
  { email: 1 },
  {
    unique: true,
    name: 'pts_accounts_email_unique_active',
    partialFilterExpression: { isDeleted: false, email: { $type: 'string' } },
  }
);

AccountSchema.index(
  { username: 1 },
  {
    unique: true,
    name: 'pts_accounts_username_unique_active',
    partialFilterExpression: { isDeleted: false, username: { $type: 'string' } },
  }
);

function partialFilterMatches(index, expected) {
  if (!index?.partialFilterExpression) return false;
  return JSON.stringify(index.partialFilterExpression) === JSON.stringify(expected);
}

async function ensureAccountIndexes() {
  const Account = getV2Model('PtsAccount', AccountSchema);
  const collection = Account.collection;
  const indexes = await collection.indexes();

  const emailExpected = { isDeleted: false, email: { $type: 'string' } };
  const emailIndex = indexes.find((row) => row.name === 'pts_accounts_email_unique_active');
  if (emailIndex && !partialFilterMatches(emailIndex, emailExpected)) {
    await collection.dropIndex('pts_accounts_email_unique_active');
  }

  const usernameExpected = { isDeleted: false, username: { $type: 'string' } };
  const usernameIndex = indexes.find((row) => row.name === 'pts_accounts_username_unique_active');
  if (usernameIndex && !partialFilterMatches(usernameIndex, usernameExpected)) {
    await collection.dropIndex('pts_accounts_username_unique_active');
  }

  await Account.updateMany(
    { email: null },
    { $unset: { email: '' } },
  );

  await Account.createIndexes();
  return Account;
}

module.exports = {
  AccountSchema,
  ensureAccountIndexes,
  getAccountModel: () => getV2Model('PtsAccount', AccountSchema),
};
