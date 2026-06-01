const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  CLIENT_STATUSES,
  CLIENT_TYPES,
  DEFAULT_BILLING_CURRENCY,
} = require('../constants/clients.constants');

const AddressSchema = new Schema(
  {
    line1: { type: String, default: null },
    line2: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    postalCode: { type: String, default: null },
    country: { type: String, default: null },
  },
  { _id: false }
);

const PrimaryContactSchema = new Schema(
  {
    name: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    jobTitle: { type: String, default: null },
  },
  { _id: false }
);

const BillingSchema = new Schema(
  {
    billingEmail: { type: String, default: null },
    billingPhone: { type: String, default: null },
    currency: { type: String, default: DEFAULT_BILLING_CURRENCY },
    taxId: { type: String, default: null },
    paymentTerms: { type: String, default: null },
  },
  { _id: false }
);

const ClientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    code: { type: String, default: null, trim: true, uppercase: true },
    type: {
      type: String,
      enum: CLIENT_TYPES,
      default: 'business',
      index: true,
    },
    status: {
      type: String,
      enum: CLIENT_STATUSES,
      default: 'active',
      index: true,
    },
    industry: { type: String, default: null, trim: true },
    website: { type: String, default: null, trim: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
    address: { type: AddressSchema, default: null },
    primaryContact: { type: PrimaryContactSchema, default: null },
    billing: { type: BillingSchema, default: null },
    notes: { type: String, default: null },
    tags: { type: [String], default: [], index: true },
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
    collection: 'pts_clients',
    timestamps: true,
  }
);

ClientSchema.index(
  { normalizedName: 1 },
  {
    unique: true,
    name: 'pts_clients_normalized_name_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

ClientSchema.index(
  { code: 1 },
  {
    unique: true,
    name: 'pts_clients_code_unique_active',
    partialFilterExpression: {
      isDeleted: false,
      code: { $type: 'string', $gt: '' },
    },
  }
);

ClientSchema.index({ updatedAt: -1, _id: -1 });

async function ensureClientIndexes() {
  const Client = getV2Model('PtsClient', ClientSchema);
  await Client.createIndexes();
  return Client;
}

module.exports = {
  ClientSchema,
  ensureClientIndexes,
  getClientModel: () => getV2Model('PtsClient', ClientSchema),
};
