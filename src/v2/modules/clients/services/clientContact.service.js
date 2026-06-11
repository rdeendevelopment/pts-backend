const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const {
  CLIENT_CONTACT_STATUSES,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
} = require('../constants/clientContact.constants');
const clientErrorCodes = require('../errors/clientErrorCodes');
const { buildDisplayName } = require('../../users/helpers/displayName.helper');
const {
  parseLimit,
  parsePage,
  buildPaginationMeta,
} = require('../helpers/pagination.helper');
const accountRepository = require('../../auth/repositories/account.repository');
const passwordService = require('../../auth/services/password.service');
const clientRepository = require('../repositories/client.repository');
const clientContactRepository = require('../repositories/clientContact.repository');
const { toClientDto } = require('../dto/client.dto');
const {
  toClientContactDto,
  toClientContactSummaryDto,
} = require('../dto/clientContact.dto');

function normalizeEmail(email) {
  const normalized = String(email || '').toLowerCase().trim();
  return normalized || null;
}

function normalizeUsername(username) {
  const normalized = String(username || '').toLowerCase().trim();
  return normalized || null;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function assertValidStatus(status) {
  if (!CLIENT_CONTACT_STATUSES.includes(status)) {
    throw new AppError('Invalid client contact status', {
      status: 400,
      code: clientErrorCodes.CLIENT_INVALID_STATUS,
      details: { allowed: CLIENT_CONTACT_STATUSES },
    });
  }
}

async function getClientOrThrow(clientId) {
  const client = await clientRepository.findById(clientId);
  if (!client || client.isDeleted) {
    throw new AppError('Client not found', {
      status: 404,
      code: clientErrorCodes.CLIENT_NOT_FOUND,
    });
  }
  return client;
}

async function getContactOrThrow(contactId) {
  const contact = await clientContactRepository.findById(contactId);
  if (!contact) {
    throw new AppError('Client contact not found', {
      status: 404,
      code: clientErrorCodes.CLIENT_CONTACT_NOT_FOUND,
    });
  }
  return contact;
}

async function assertEmailAvailable(clientId, email, { excludeContactId = null, excludeAccountId = null } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  const existingContact = await clientContactRepository.findByClientAndEmail(clientId, normalized);
  if (existingContact && (!excludeContactId || String(existingContact._id) !== String(excludeContactId))) {
    throw new AppError('Client contact email is already in use for this client', {
      status: 409,
      code: clientErrorCodes.CLIENT_CONTACT_EMAIL_ALREADY_EXISTS,
      details: { clientId: String(clientId), email: normalized },
    });
  }

  const existingAccount = await accountRepository.findByEmail(normalized);
  if (existingAccount && (!excludeAccountId || String(existingAccount._id) !== String(excludeAccountId))) {
    throw new AppError('Email is already registered', {
      status: 409,
      code: clientErrorCodes.CLIENT_CONTACT_EMAIL_ALREADY_EXISTS,
      details: { email: normalized },
    });
  }
}

async function resolveAccountForContact(clientId, payload = {}) {
  if (payload.accountId || payload.account_id) {
    const accountId = assertObjectId(payload.accountId || payload.account_id, 'accountId');
    const account = await accountRepository.findById(accountId);
    if (!account) {
      throw new AppError('Linked account not found', {
        status: 404,
        code: clientErrorCodes.CLIENT_CONTACT_NOT_FOUND,
      });
    }
    if (account.accountType !== 'client' || String(account.clientId || '') !== String(clientId)) {
      throw new AppError('Linked account must be a client account for this client', {
        status: 400,
        code: clientErrorCodes.CLIENT_CONTACT_ACCOUNT_TYPE_INVALID,
      });
    }
    const existingContact = await clientContactRepository.findByAccountId(accountId);
    if (existingContact) {
      throw new AppError('Account is already linked to a client contact', {
        status: 409,
        code: clientErrorCodes.CLIENT_CONTACT_ACCOUNT_ALREADY_LINKED,
        details: { accountId: String(accountId) },
      });
    }
    return account;
  }

  const email = normalizeEmail(payload.email);
  const username = normalizeUsername(payload.username || payload.user_name || payload.userName);
  if (!email && !username) {
    throw new AppError('Email or username is required for client contact login', {
      status: 400,
      code: clientErrorCodes.CLIENT_CONTACT_NOT_FOUND,
    });
  }
  if (!payload.password) {
    throw new AppError('Password is required when creating a client contact login', {
      status: 400,
      code: clientErrorCodes.CLIENT_CONTACT_NOT_FOUND,
    });
  }

  if (email) await assertEmailAvailable(clientId, email);
  if (username) {
    const existingUsername = await accountRepository.findByUsername(username);
    if (existingUsername) {
      throw new AppError('Username is already registered', {
        status: 409,
        code: clientErrorCodes.CLIENT_CONTACT_EMAIL_ALREADY_EXISTS,
        details: { username },
      });
    }
  }

  const firstName = String(payload.firstName || payload.first_name || '').trim();
  const lastName = String(payload.lastName || payload.last_name || '').trim();
  const passwordHash = await passwordService.hashPassword(payload.password);

  return accountRepository.createAccount({
    email,
    username,
    passwordHash,
    firstName,
    lastName,
    status: payload.status && CLIENT_CONTACT_STATUSES.includes(payload.status) ? payload.status : 'active',
    accountType: 'client',
    clientId,
  });
}

function buildContactPayload(payload = {}, account = null, { forUpdate = false } = {}) {
  const data = {};
  const firstName = payload.firstName ?? payload.first_name;
  const lastName = payload.lastName ?? payload.last_name;

  if (firstName !== undefined) data.firstName = String(firstName).trim();
  else if (!forUpdate && account?.firstName) data.firstName = String(account.firstName).trim();

  if (lastName !== undefined) data.lastName = String(lastName).trim();
  else if (!forUpdate && account?.lastName) data.lastName = String(account.lastName).trim();

  const displayName = payload.displayName ?? payload.display_name;
  if (displayName !== undefined) {
    data.displayName = buildDisplayName(
      data.firstName || account?.firstName || firstName,
      data.lastName || account?.lastName || lastName,
      displayName
    );
  } else if (data.firstName !== undefined || data.lastName !== undefined) {
    data.displayName = buildDisplayName(
      data.firstName || account?.firstName || firstName,
      data.lastName || account?.lastName || lastName,
      null
    );
  } else if (!forUpdate) {
    data.displayName = buildDisplayName(data.firstName, data.lastName, null);
  }

  if (payload.email !== undefined) data.email = normalizeEmail(payload.email);
  else if (!forUpdate && account?.email) data.email = normalizeEmail(account.email);

  if (payload.phone !== undefined) data.phone = payload.phone || null;
  if (payload.jobTitle !== undefined || payload.job_title !== undefined) {
    data.jobTitle = payload.jobTitle || payload.job_title || null;
  }
  if (payload.status !== undefined) {
    assertValidStatus(payload.status);
    data.status = payload.status;
  } else if (!forUpdate) {
    data.status = 'active';
  }
  if (payload.isPrimaryContact !== undefined || payload.is_primary_contact !== undefined) {
    data.isPrimaryContact = normalizeBoolean(payload.isPrimaryContact ?? payload.is_primary_contact);
  }
  if (payload.notes !== undefined) data.notes = payload.notes || null;

  return data;
}

function resolveListSort(query = {}) {
  const rawField = String(query.sort_by || query.sortBy || '').trim();
  const rawOrder = String(query.sort_order || query.sortOrder || '').toLowerCase();
  const direction = rawOrder === 'desc' ? -1 : 1;
  const sortMap = {
    name: 'displayName',
    display_name: 'displayName',
    email: 'email',
    status: 'status',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
  };
  return { [sortMap[rawField] || 'displayName']: direction, _id: direction };
}

async function listClientContacts(clientId, query = {}) {
  const normalizedClientId = assertObjectId(clientId, 'clientId');
  await getClientOrThrow(normalizedClientId);

  const limit = parseLimit(query.limit, {
    defaultLimit: DEFAULT_LIST_LIMIT,
    maxLimit: MAX_LIST_LIMIT,
  });
  const page = parsePage(query.page || 1);
  const filters = {
    clientId: normalizedClientId,
    search: query.search,
    status: query.status,
  };
  if (query.is_primary_contact !== undefined || query.isPrimaryContact !== undefined) {
    filters.isPrimaryContact = String(query.is_primary_contact ?? query.isPrimaryContact).toLowerCase() === 'true';
  }
  if (filters.status) assertValidStatus(filters.status);

  const { items, total } = await clientContactRepository.listContacts(filters, {
    limit,
    skip: (page - 1) * limit,
    sort: resolveListSort(query),
  });

  return {
    items: items.map(toClientContactDto),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

async function createClientContact(clientId, payload = {}, accountId = null) {
  const normalizedClientId = assertObjectId(clientId, 'clientId');
  await getClientOrThrow(normalizedClientId);
  const account = await resolveAccountForContact(normalizedClientId, payload);
  const data = buildContactPayload(payload, account);

  if (data.email) {
    await assertEmailAvailable(normalizedClientId, data.email, { excludeAccountId: account._id });
  }

  const contact = await clientContactRepository.createContact({
    ...data,
    accountId: account._id,
    clientId: normalizedClientId,
    createdBy: accountId,
    updatedBy: accountId,
  });

  return toClientContactDto(contact);
}

async function updateClientContact(contactId, payload = {}, accountId = null) {
  const contact = await getContactOrThrow(contactId);
  const updates = buildContactPayload(payload, contact, { forUpdate: true });

  if (updates.email && updates.email !== contact.email) {
    await assertEmailAvailable(contact.clientId, updates.email, {
      excludeContactId: contact._id,
      excludeAccountId: contact.accountId,
    });
  }

  updates.updatedBy = accountId;
  const updated = await clientContactRepository.updateContact(contact._id, updates);

  const accountUpdates = {};
  if (updates.email !== undefined && updates.email !== contact.email) accountUpdates.email = updates.email;
  if (updates.firstName !== undefined) accountUpdates.firstName = updates.firstName;
  if (updates.lastName !== undefined) accountUpdates.lastName = updates.lastName;
  if (updates.status !== undefined) accountUpdates.status = updates.status;
  if (Object.keys(accountUpdates).length) {
    await accountRepository.updateAccount(contact.accountId, accountUpdates);
  }

  return toClientContactDto(updated);
}

async function updateClientContactStatus(contactId, status, accountId = null) {
  assertValidStatus(status);
  const contact = await getContactOrThrow(contactId);
  const updated = await clientContactRepository.updateContact(contact._id, {
    status,
    updatedBy: accountId,
  });
  await accountRepository.updateAccountStatus(contact.accountId, status);
  return toClientContactDto(updated);
}

async function deleteClientContact(contactId) {
  const contact = await getContactOrThrow(contactId);
  await clientContactRepository.softDeleteContact(contact._id);
  await accountRepository.updateAccountStatus(contact.accountId, 'inactive');
  return { deleted: true, id: String(contact._id) };
}

async function getClientContactSummaryForAccount(accountId) {
  const contact = await clientContactRepository.findByAccountId(accountId);
  return contact ? toClientContactSummaryDto(contact) : null;
}

async function getClientSessionForAccount(account) {
  if (!account || account.accountType !== 'client') {
    return { clientContact: null, client: null };
  }

  const contact = await clientContactRepository.findByAccountId(account._id);
  const client = account.clientId ? await clientRepository.findById(account.clientId) : null;

  return {
    clientContact: contact ? toClientContactSummaryDto(contact) : null,
    client: client ? toClientDto(client) : null,
  };
}

module.exports = {
  listClientContacts,
  createClientContact,
  updateClientContact,
  updateClientContactStatus,
  deleteClientContact,
  getClientContactSummaryForAccount,
  getClientSessionForAccount,
};
