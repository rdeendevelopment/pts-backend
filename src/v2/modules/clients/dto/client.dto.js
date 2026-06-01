function toAddressDto(address) {
  if (!address) return null;
  return {
    line1: address.line1 || null,
    line2: address.line2 || null,
    city: address.city || null,
    state: address.state || null,
    postal_code: address.postalCode || null,
    country: address.country || null,
  };
}

function toPrimaryContactDto(contact) {
  if (!contact) return null;
  return {
    name: contact.name || null,
    email: contact.email || null,
    phone: contact.phone || null,
    job_title: contact.jobTitle || null,
  };
}

function toBillingDto(billing) {
  if (!billing) return null;
  return {
    billing_email: billing.billingEmail || null,
    billing_phone: billing.billingPhone || null,
    currency: billing.currency || 'USD',
    tax_id: billing.taxId || null,
    payment_terms: billing.paymentTerms || null,
  };
}

function toClientDto(clientDoc) {
  if (!clientDoc) return null;
  const row = clientDoc.toObject ? clientDoc.toObject() : clientDoc;

  return {
    id: String(row._id),
    name: row.name,
    code: row.code || null,
    type: row.type,
    status: row.status,
    industry: row.industry || null,
    website: row.website || null,
    email: row.email || null,
    phone: row.phone || null,
    address: toAddressDto(row.address),
    primary_contact: toPrimaryContactDto(row.primaryContact),
    billing: toBillingDto(row.billing),
    notes: row.notes || null,
    tags: row.tags || [],
    created_by: row.createdBy ? String(row.createdBy) : null,
    updated_by: row.updatedBy ? String(row.updatedBy) : null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

module.exports = {
  toClientDto,
};
