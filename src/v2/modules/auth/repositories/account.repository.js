const { getAccountModel } = require('../models/account.model');

function buildAccountLookupFilter(base, { activeOnly = false } = {}) {
  const filter = { ...base, isDeleted: false };
  if (activeOnly) filter.status = 'active';
  return filter;
}

async function findByEmail(email, { includePassword = false, activeOnly = false } = {}) {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized) return null;

  const Account = getAccountModel();
  let query = Account.findOne(buildAccountLookupFilter({ email: normalized }, { activeOnly }));
  if (includePassword) {
    query = query.select('+passwordHash');
  }
  return query.lean({ virtuals: false }).exec().then((doc) => doc || null);
}

async function findByUsername(username, { includePassword = false, activeOnly = false } = {}) {
  const normalized = String(username || '').toLowerCase().trim();
  if (!normalized) return null;

  const Account = getAccountModel();
  let query = Account.findOne(buildAccountLookupFilter({ username: normalized }, { activeOnly }));
  if (includePassword) {
    query = query.select('+passwordHash');
  }
  return query.lean({ virtuals: false }).exec().then((doc) => doc || null);
}

/** Legacy accounts: match the part before @ when user signs in with a short name. */
async function findByEmailLocalPart(localPart, { includePassword = false, activeOnly = false } = {}) {
  const normalized = String(localPart || '').toLowerCase().trim();
  if (!normalized || normalized.includes('@')) return null;

  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const Account = getAccountModel();
  let query = Account.findOne(buildAccountLookupFilter({
    email: { $regex: `^${escaped}@`, $options: 'i' },
  }, { activeOnly })).sort({ createdAt: 1 });
  if (includePassword) {
    query = query.select('+passwordHash');
  }
  return query.lean({ virtuals: false }).exec().then((doc) => doc || null);
}

async function findById(accountId, { includePassword = false, activeOnly = false } = {}) {
  const Account = getAccountModel();
  let query = Account.findOne(buildAccountLookupFilter({ _id: accountId }, { activeOnly }));
  if (includePassword) {
    query = query.select('+passwordHash');
    return query.lean({ virtuals: false }).exec().then((doc) => doc || null);
  }
  return query.exec();
}

function sanitizeAccountCreatePayload(payload = {}) {
  const doc = { ...payload };
  if (doc.email == null || doc.email === '') delete doc.email;
  if (doc.username == null || doc.username === '') delete doc.username;
  if (doc.clientId == null) delete doc.clientId;
  return doc;
}

async function createAccount(payload) {
  const Account = getAccountModel();
  return Account.create(sanitizeAccountCreatePayload(payload));
}

async function updateLastLogin(accountId) {
  const Account = getAccountModel();
  return Account.updateOne({ _id: accountId }, { $set: { lastLoginAt: new Date() } });
}

async function findFirstByAccountType(accountType) {
  const Account = getAccountModel();
  return Account.findOne({
    accountType,
    isDeleted: false,
    status: 'active',
  })
    .sort({ createdAt: 1 })
    .exec();
}

async function findAllByAccountType(accountType) {
  const Account = getAccountModel();
  return Account.find({
    accountType,
    isDeleted: false,
    status: 'active',
  })
    .sort({ createdAt: 1 })
    .exec();
}

async function updateAccount(accountId, updates) {
  const Account = getAccountModel();
  return Account.findOneAndUpdate(
    { _id: accountId, isDeleted: false },
    { $set: updates },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function updateAccountStatus(accountId, status) {
  const Account = getAccountModel();
  return Account.updateOne(
    { _id: accountId, isDeleted: false },
    { $set: { status } }
  );
}

module.exports = {
  findByEmail,
  findByUsername,
  findByEmailLocalPart,
  findById,
  createAccount,
  updateLastLogin,
  findFirstByAccountType,
  findAllByAccountType,
  updateAccount,
  updateAccountStatus,
};
