const { toSessionRoleDto } = require('./role.dto');

function toAccountRoleDto(accountRoleDoc, roleDoc) {
  if (!accountRoleDoc) return null;
  const row = accountRoleDoc.toObject ? accountRoleDoc.toObject() : accountRoleDoc;

  return {
    id: String(row._id),
    account_id: String(row.accountId),
    role: roleDoc ? toSessionRoleDto(roleDoc) : { id: String(row.roleId) },
    status: row.status,
    assigned_by: row.assignedBy ? String(row.assignedBy) : null,
    assigned_at: row.assignedAt || null,
    created_at: row.createdAt || null,
  };
}

module.exports = {
  toAccountRoleDto,
};
