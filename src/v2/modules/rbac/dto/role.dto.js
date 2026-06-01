function toRoleDto(roleDoc) {
  if (!roleDoc) return null;
  const row = roleDoc.toObject ? roleDoc.toObject() : roleDoc;

  return {
    id: String(row._id),
    key: row.key,
    name: row.name,
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    is_system: Boolean(row.isSystem),
    created_at: row.createdAt || null,
    updated_at: row.updatedAt || null,
  };
}

function toSessionRoleDto(roleDoc) {
  if (!roleDoc) return null;
  const row = roleDoc.toObject ? roleDoc.toObject() : roleDoc;

  return {
    id: String(row._id),
    key: row.key,
    name: row.name,
  };
}

module.exports = {
  toRoleDto,
  toSessionRoleDto,
};
