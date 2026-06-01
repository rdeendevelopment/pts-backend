function toUserDto(userDoc) {
  if (!userDoc) return null;
  const row = userDoc.toObject ? userDoc.toObject() : userDoc;

  return {
    id: String(row._id),
    account_id: String(row.accountId),
    first_name: row.firstName,
    last_name: row.lastName,
    display_name: row.displayName,
    username: row.username || null,
    email: row.email,
    phone: row.phone || null,
    avatar_url: row.avatarUrl || null,
    job_title: row.jobTitle || null,
    department: row.department || null,
    employment_type: row.employmentType,
    status: row.status,
    manager_id: row.managerId ? String(row.managerId) : null,
    joining_date: row.joiningDate || null,
    timezone: row.timezone || 'UTC',
    notes: row.notes || null,
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

/** Compact shape for auth session responses — no internal notes. */
function toUserSummaryDto(userDoc) {
  if (!userDoc) return null;
  const row = userDoc.toObject ? userDoc.toObject() : userDoc;

  return {
    id: String(row._id),
    username: row.username || null,
    display_name: row.displayName,
    email: row.email,
    job_title: row.jobTitle || null,
    department: row.department || null,
    status: row.status,
  };
}

module.exports = {
  toUserDto,
  toUserSummaryDto,
};
