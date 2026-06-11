const { getClientContactModel } = require('../models/clientContact.model');

function buildListQuery(filters = {}) {
  const query = { isDeleted: false };

  if (filters.clientId) query.clientId = filters.clientId;
  if (filters.status) query.status = filters.status;
  if (filters.isPrimaryContact !== undefined) query.isPrimaryContact = filters.isPrimaryContact;

  if (filters.search) {
    const term = String(filters.search).trim();
    if (term) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { displayName: regex },
        { email: regex },
        { jobTitle: regex },
      ];
    }
  }

  return query;
}

async function listContacts(filters = {}, { limit = 20, skip = 0, sort = { displayName: 1, _id: 1 } } = {}) {
  const ClientContact = getClientContactModel();
  const query = buildListQuery(filters);
  const [items, total] = await Promise.all([
    ClientContact.find(query).sort(sort).skip(skip).limit(limit).lean(),
    ClientContact.countDocuments(query),
  ]);
  return { items, total };
}

async function findById(contactId) {
  const ClientContact = getClientContactModel();
  return ClientContact.findOne({ _id: contactId, isDeleted: false }).exec();
}

async function findByAccountId(accountId) {
  const ClientContact = getClientContactModel();
  return ClientContact.findOne({ accountId, isDeleted: false }).exec();
}

async function findByClientAndEmail(clientId, email) {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized) return null;
  const ClientContact = getClientContactModel();
  return ClientContact.findOne({ clientId, email: normalized, isDeleted: false }).exec();
}

async function createContact(payload) {
  const ClientContact = getClientContactModel();
  return ClientContact.create(payload);
}

async function updateContact(contactId, updates) {
  const ClientContact = getClientContactModel();
  return ClientContact.findOneAndUpdate(
    { _id: contactId, isDeleted: false },
    { $set: updates },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function softDeleteContact(contactId) {
  const ClientContact = getClientContactModel();
  return ClientContact.findOneAndUpdate(
    { _id: contactId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), status: 'inactive' } },
    { returnDocument: 'after' }
  ).exec();
}

module.exports = {
  listContacts,
  findById,
  findByAccountId,
  findByClientAndEmail,
  createContact,
  updateContact,
  softDeleteContact,
};
