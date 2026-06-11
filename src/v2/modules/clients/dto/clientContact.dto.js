function toClientContactDto(contactDoc) {
  if (!contactDoc) return null;
  const row = contactDoc.toObject ? contactDoc.toObject() : contactDoc;

  return {
    id: String(row._id),
    account_id: row.accountId ? String(row.accountId) : null,
    client_id: row.clientId ? String(row.clientId) : null,
    first_name: row.firstName,
    last_name: row.lastName,
    display_name: row.displayName,
    email: row.email || null,
    phone: row.phone || null,
    job_title: row.jobTitle || null,
    status: row.status,
    invite_status: row.inviteStatus || 'not_invited',
    last_invited_at: row.lastInvitedAt || null,
    is_primary_contact: Boolean(row.isPrimaryContact),
    notes: row.notes || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toClientContactSummaryDto(contactDoc) {
  if (!contactDoc) return null;
  const row = contactDoc.toObject ? contactDoc.toObject() : contactDoc;

  return {
    id: String(row._id),
    account_id: row.accountId ? String(row.accountId) : null,
    client_id: row.clientId ? String(row.clientId) : null,
    first_name: row.firstName,
    last_name: row.lastName,
    display_name: row.displayName,
    email: row.email || null,
    job_title: row.jobTitle || null,
    status: row.status,
    is_primary_contact: Boolean(row.isPrimaryContact),
  };
}

module.exports = {
  toClientContactDto,
  toClientContactSummaryDto,
};
