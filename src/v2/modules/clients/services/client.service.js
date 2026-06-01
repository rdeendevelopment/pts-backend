const { AppError } = require('../../../kernel/errors');
const {
  CLIENT_STATUSES,
  CLIENT_TYPES,
  DEFAULT_BILLING_CURRENCY,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
} = require('../constants/clients.constants');
const clientErrorCodes = require('../errors/clientErrorCodes');
const {
  normalizeClientName,
  generateClientCode,
  normalizeTags,
} = require('../helpers/client.helper');
const { clientHasActiveProjects } = require('../helpers/projectGuard.helper');
const { decodeCursor, encodeCursor, parseLimit } = require('../helpers/pagination.helper');
const clientRepository = require('../repositories/client.repository');
const { toClientDto } = require('../dto/client.dto');

function assertValidStatus(status) {
  if (!CLIENT_STATUSES.includes(status)) {
    throw new AppError('Invalid client status', {
      status: 400,
      code: clientErrorCodes.CLIENT_INVALID_STATUS,
      details: { allowed: CLIENT_STATUSES },
    });
  }
}

function assertValidType(type) {
  if (!CLIENT_TYPES.includes(type)) {
    throw new AppError('Invalid client type', {
      status: 400,
      code: clientErrorCodes.CLIENT_INVALID_TYPE,
      details: { allowed: CLIENT_TYPES },
    });
  }
}

async function getClientOrThrow(clientId) {
  const client = await clientRepository.findById(clientId);
  if (!client) {
    throw new AppError('Client not found', {
      status: 404,
      code: clientErrorCodes.CLIENT_NOT_FOUND,
    });
  }
  return client;
}

async function assertUniqueName(normalizedName, { excludeClientId = null } = {}) {
  const existing = await clientRepository.findByNormalizedName(normalizedName);
  if (existing && (!excludeClientId || String(existing._id) !== String(excludeClientId))) {
    throw new AppError('Client name already exists', {
      status: 409,
      code: clientErrorCodes.CLIENT_NAME_ALREADY_EXISTS,
      details: { name: normalizedName },
    });
  }
}

async function assertUniqueCode(code, { excludeClientId = null } = {}) {
  if (!code) return;

  const existing = await clientRepository.findByCode(code);
  if (existing && (!excludeClientId || String(existing._id) !== String(excludeClientId))) {
    throw new AppError('Client code already exists', {
      status: 409,
      code: clientErrorCodes.CLIENT_CODE_ALREADY_EXISTS,
      details: { code },
    });
  }
}

function mapAddress(payload = {}) {
  if (payload.address === null) return null;
  if (!payload.address && !payload.line1) return undefined;

  const source = payload.address || payload;
  return {
    line1: source.line1 || source.line_1 || null,
    line2: source.line2 || source.line_2 || null,
    city: source.city || null,
    state: source.state || null,
    postalCode: source.postalCode || source.postal_code || null,
    country: source.country || null,
  };
}

function mapPrimaryContact(payload = {}) {
  if (payload.primaryContact === null || payload.primary_contact === null) return null;
  const source = payload.primaryContact || payload.primary_contact;
  if (!source) return undefined;

  return {
    name: source.name || null,
    email: source.email ? String(source.email).toLowerCase().trim() : null,
    phone: source.phone || null,
    jobTitle: source.jobTitle || source.job_title || null,
  };
}

function mapBilling(payload = {}) {
  if (payload.billing === null) return null;
  const source = payload.billing;
  if (!source) return undefined;

  return {
    billingEmail: source.billingEmail || source.billing_email
      ? String(source.billingEmail || source.billing_email).toLowerCase().trim()
      : null,
    billingPhone: source.billingPhone || source.billing_phone || null,
    currency: source.currency || DEFAULT_BILLING_CURRENCY,
    taxId: source.taxId || source.tax_id || null,
    paymentTerms: source.paymentTerms || source.payment_terms || null,
  };
}

function buildClientPayload(payload, { forUpdate = false } = {}) {
  const data = {};

  if (payload.name !== undefined) {
    data.name = String(payload.name).trim();
    data.normalizedName = normalizeClientName(payload.name);
  }

  if (payload.code !== undefined && payload.code !== null && String(payload.code).trim()) {
    data.code = String(payload.code).trim().toUpperCase();
  } else if (!forUpdate && payload.name) {
    data.code = generateClientCode(payload.name);
  } else if (payload.code !== undefined) {
    data.code = null;
  }

  if (payload.type !== undefined) {
    assertValidType(payload.type);
    data.type = payload.type;
  } else if (!forUpdate) {
    data.type = 'business';
  }

  if (payload.status !== undefined) {
    assertValidStatus(payload.status);
    data.status = payload.status;
  } else if (!forUpdate) {
    data.status = 'active';
  }

  if (payload.industry !== undefined) data.industry = payload.industry || null;
  if (payload.website !== undefined) data.website = payload.website || null;
  if (payload.email !== undefined) {
    data.email = payload.email ? String(payload.email).toLowerCase().trim() : null;
  }
  if (payload.phone !== undefined) data.phone = payload.phone || null;
  if (payload.notes !== undefined) data.notes = payload.notes || null;
  if (payload.tags !== undefined) data.tags = normalizeTags(payload.tags);

  const address = mapAddress(payload);
  if (address !== undefined) data.address = address;

  const primaryContact = mapPrimaryContact(payload);
  if (primaryContact !== undefined) data.primaryContact = primaryContact;

  const billing = mapBilling(payload);
  if (billing !== undefined) data.billing = billing;

  return data;
}

async function listClients(query = {}) {
  const limit = parseLimit(query.limit, {
    defaultLimit: DEFAULT_LIST_LIMIT,
    maxLimit: MAX_LIST_LIMIT,
  });
  const cursor = decodeCursor(query.cursor);
  const includeDeleted = String(query.include_deleted || query.includeDeleted || '').toLowerCase() === 'true';

  const { items, nextCursor, hasMore } = await clientRepository.listClients(
    {
      search: query.search,
      status: query.status,
      type: query.type,
      industry: query.industry,
      tag: query.tag,
      includeDeleted,
    },
    { limit, cursor }
  );

  return {
    items: items.map(toClientDto),
    pagination: {
      limit,
      has_more: hasMore,
      next_cursor: nextCursor ? encodeCursor(nextCursor) : null,
    },
  };
}

async function getClientById(clientId) {
  const client = await getClientOrThrow(clientId);
  return toClientDto(client);
}

async function createClient(payload, accountId) {
  const data = buildClientPayload(payload);
  await assertUniqueName(data.normalizedName);
  await assertUniqueCode(data.code);

  const client = await clientRepository.createClient({
    ...data,
    createdBy: accountId,
    updatedBy: accountId,
  });

  return toClientDto(client);
}

async function updateClient(clientId, payload, accountId) {
  const client = await getClientOrThrow(clientId);
  const updates = buildClientPayload(payload, { forUpdate: true });

  if (updates.normalizedName && updates.normalizedName !== client.normalizedName) {
    await assertUniqueName(updates.normalizedName, { excludeClientId: client._id });
  }

  if (updates.code !== undefined && updates.code !== client.code) {
    await assertUniqueCode(updates.code, { excludeClientId: client._id });
  }

  updates.updatedBy = accountId;

  const updated = await clientRepository.updateClient(client._id, updates);
  return toClientDto(updated);
}

async function updateClientStatus(clientId, status, accountId) {
  assertValidStatus(status);
  await getClientOrThrow(clientId);

  const updated = await clientRepository.updateClient(clientId, {
    status,
    updatedBy: accountId,
  });

  return toClientDto(updated);
}

async function deleteClient(clientId, accountId) {
  const client = await getClientOrThrow(clientId);

  if (await clientHasActiveProjects(client._id)) {
    throw new AppError('Client has active projects and cannot be deleted', {
      status: 409,
      code: clientErrorCodes.CLIENT_HAS_ACTIVE_PROJECTS,
      details: { clientId: String(client._id) },
    });
  }

  await clientRepository.softDeleteClient(client._id, accountId);
  return { deleted: true, id: String(client._id) };
}

module.exports = {
  listClients,
  getClientById,
  createClient,
  updateClient,
  updateClientStatus,
  deleteClient,
  assertValidStatus,
  assertValidType,
};
