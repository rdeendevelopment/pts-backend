const { buildNormalizedName, normalizeName, buildSourceHash } = require('../helpers/migrationBase.helper');
const { mapClientStatus, mapClientType } = require('../helpers/enumMaps.helper');

function buildClientName(doc) {
  const company = normalizeName(doc.companyName, '');
  if (company) return company;
  const person = `${normalizeName(doc.firstName, '')} ${normalizeName(doc.lastName, '')}`.trim();
  return person || null;
}

function transformLegacyClient(doc) {
  const name = buildClientName(doc);
  if (!name) {
    return { error: { code: 'CLIENT_NAME_MISSING', message: 'Legacy client has no usable name.' } };
  }

  return {
    payload: {
      name,
      normalizedName: buildNormalizedName(name),
      type: mapClientType(doc.type),
      status: mapClientStatus(doc),
      email: doc.email ? String(doc.email).toLowerCase().trim() : null,
      phone: doc.contact || null,
      primaryContact: doc.firstName || doc.lastName
        ? {
          name: `${normalizeName(doc.firstName, '')} ${normalizeName(doc.lastName, '')}`.trim() || null,
          email: doc.email ? String(doc.email).toLowerCase().trim() : null,
          phone: doc.contact || null,
        }
        : null,
      isDeleted: Boolean(doc.isDeleted),
      deletedAt: doc.isDeleted ? doc.updatedAt || new Date() : null,
    },
    sourceHash: buildSourceHash(doc, 'clients'),
    legacyId: doc.legacyId ?? null,
    oldObjectId: doc._id,
  };
}

module.exports = {
  buildClientName,
  transformLegacyClient,
};
