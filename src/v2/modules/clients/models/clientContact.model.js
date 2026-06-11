const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { CLIENT_CONTACT_STATUSES } = require('../constants/clientContact.constants');

const ClientContactSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      required: true,
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsClient',
      required: true,
      index: true,
    },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    email: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: { type: String, default: null, trim: true },
    jobTitle: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: CLIENT_CONTACT_STATUSES,
      default: 'active',
      index: true,
    },
    inviteStatus: {
      type: String,
      enum: ['not_invited', 'invited', 'accepted'],
      default: 'not_invited',
    },
    lastInvitedAt: { type: Date, default: null },
    isPrimaryContact: { type: Boolean, default: false, index: true },
    notes: { type: String, default: null },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      default: null,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      default: null,
    },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_client_contacts',
    timestamps: true,
  }
);

ClientContactSchema.index(
  { accountId: 1 },
  {
    unique: true,
    name: 'pts_client_contacts_account_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

ClientContactSchema.index(
  { clientId: 1, email: 1 },
  {
    unique: true,
    name: 'pts_client_contacts_client_email_unique_active',
    partialFilterExpression: { isDeleted: false, email: { $type: 'string' } },
  }
);

ClientContactSchema.index({ clientId: 1, status: 1, displayName: 1 });
ClientContactSchema.index({ updatedAt: -1, _id: -1 });

async function ensureClientContactIndexes() {
  const ClientContact = getV2Model('PtsClientContact', ClientContactSchema);
  await ClientContact.createIndexes();
  return ClientContact;
}

module.exports = {
  ClientContactSchema,
  ensureClientContactIndexes,
  getClientContactModel: () => getV2Model('PtsClientContact', ClientContactSchema),
};
